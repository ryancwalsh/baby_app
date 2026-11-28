import { MILLISECONDS_PER_MINUTE } from '@/constants/time';
import { initialSwitchState, needsRecentring, nextPhase, observe, type Phase, setpointsFor, type SwitchState, switchTo } from '@/services/ecobee/crib-switch';
import { type CribRange, getCurrentSetpoints, isWithinActiveHours, orderForWriting, type Setpoints, setpointsDiffer, smoothOffset } from '@/services/ecobee/decide';
import { clearHold, readThermostat, type ThermostatState, writeSetpoints } from '@/services/ecobee/thermostat';
import { connect, getTemperature } from '@/services/nanit/connection';
import { getCribRange, getThermostatSchedule, recordThermostatDecision, type ThermostatDecisionRecord } from '@/storage/thermostat';

/**
 * The worker's loop that steers the hallway ecobee from the crib's temperature. The goals, the challenges, and the algorithm are in thermostat_control.md; how the thermostat is reached and the fail-safe rules are in ecobee_plan.md.
 *
 * Every minute it reads the crib and the thermostat. Inside the active hours set on the Settings page, and while switched on there, the crib switches the furnace (`services/ecobee/crib-switch.ts`): the loop holds the thermostat throughout, with setpoints placed relative to the hallway's own reading so that the ecobee heats, cools, or rests as the crib calls for. It lets go (clears its hold, so the schedule takes over) when the hours end, when it is switched off, or when the crib reading goes stale. A person always wins: if the setpoints are changed by anything but this loop, it leaves the thermostat alone until the active hours next end. Outside the active hours it only logs.
 *
 * Started once per worker process by `instrumentation.ts`. It opens the shared Nanit connection, which only ever reads, so the crib reading is there without a phone having a page open.
 */

/**
 * Also when the first decision comes after start, which is long enough for the Nanit connection to have delivered a reading.
 */
const DECIDE_EVERY_MILLISECONDS = MILLISECONDS_PER_MINUTE;
/**
 * A decision that writes nothing and says the same as the last one logged is only logged this often.
 */
const LOG_EVERY_MILLISECONDS = 10 * MILLISECONDS_PER_MINUTE;
/**
 * A crib reading older than this is not acted on; the server asks every 30 seconds, so this means something is wrong.
 */
const CRIB_READING_FRESH_MILLISECONDS = 10 * MILLISECONDS_PER_MINUTE;
/**
 * A crib reading outside this is taken for a fault, not a room.
 */
const LOWEST_SANE_CRIB_CELSIUS = 10;
const HIGHEST_SANE_CRIB_CELSIUS = 35;
/**
 * The hallway–crib offset is no longer used to steer, only logged, as a record of how the two rooms compare. Averaged over longer than a furnace cycle.
 */
const OFFSET_TIME_CONSTANT_MILLISECONDS = 90 * MILLISECONDS_PER_MINUTE;
/**
 * The ecobee app's Hold Action is meant to be 2 hours, so setpoints that change this long after the loop's last write are taken for its hold ending, not for a person. Measured to the decision before the hold would end.
 */
const HOLD_ENDS_AFTER_MILLISECONDS = 110 * MILLISECONDS_PER_MINUTE;
/**
 * The hold is written again after this long, relative to the hallway's current reading, so that it does not expire while the loop still wants it.
 */
const RENEW_HOLD_AFTER_MILLISECONDS = 90 * MILLISECONDS_PER_MINUTE;

const EMPTY_RECORD = {
  cribCelsius: null,
  currentCoolCelsius: null,
  currentHeatCelsius: null,
  hallwayCelsius: null,
  mode: null,
  offsetCelsius: null,
  proposedCoolCelsius: null,
  proposedHeatCelsius: null,
};

type LoopState = {
  /**
   * What this loop last wrote and when, while its hold may still be in place. Null once released, and after a restart, since memory does not survive one; the Hold Action ends a hold left behind.
   */
  held: null | { atMilliseconds: number; setpoints: Setpoints };
  /**
   * Set when a person changed the setpoints, and cleared when the active hours end.
   */
  isPaused: boolean;
  /**
   * The last decision logged, so that a quiet minute is not logged every minute.
   */
  lastLogged: null | { atMilliseconds: number; outcome: string };
  offset: null | { atMilliseconds: number; celsius: number };
  /**
   * The crib switch, while the loop holds the thermostat. Null when it has let go, so that taking hold again starts from whatever the ecobee is doing.
   */
  switch: null | SwitchState;
};

/**
 * Kept on `globalThis` so that a module loaded twice, as Next can do, still runs one loop.
 */
const shared = globalThis as typeof globalThis & { thermostatLoop?: LoopState };

function getState() {
  shared.thermostatLoop ??= { held: null, isPaused: false, lastLogged: null, offset: null, switch: null };

  return shared.thermostatLoop;
}

/**
 * Clears the loop's hold if it has one, and says so in the outcome.
 */
async function release(state: LoopState, reason: string, otherwise: string) {
  let outcome = otherwise;
  state.switch = null;
  if (state.held !== null) {
    await clearHold();
    // eslint-disable-next-line require-atomic-updates -- runOnce never lets two decisions overlap, so nothing else changes `held` meanwhile.
    state.held = null;
    outcome = `released: ${reason}`;
  }

  return outcome;
}

/**
 * What the thermostat holds just after a write, which is what a person's change is later compared against. If the read fails, what was sent is the best guess left. It does not catch the ecobee pushing its thresholds apart: a read straight after the write still returns what was sent, and the change shows only later. Sending the thresholds in the order `orderForWriting` gives is what prevents that.
 */
async function readBackSetpoints(sent: Setpoints) {
  let setpoints = sent;
  try {
    setpoints = getCurrentSetpoints((await readThermostat()).target);
  } catch (error) {
    console.error('The thermostat loop could not read back what it wrote.', error);
  }

  return setpoints;
}

async function write(state: LoopState, thermostat: ThermostatState, toSend: Setpoints) {
  const current = getCurrentSetpoints(thermostat.target);
  const writes = thermostat.target.mode === 'auto' ? orderForWriting(current, toSend) : [toSend];
  for (const setpoints of writes) {
    await writeSetpoints(thermostat.target.mode, setpoints);
  }

  state.held = { atMilliseconds: Date.now(), setpoints: await readBackSetpoints(toSend) };
}

const SWITCH_OUTCOMES: Record<string, string> = {
  'cooling>resting': 'stopped cooling',
  'heating>resting': 'stopped heating',
  'resting>cooling': 'started cooling',
  'resting>heating': 'started heating',
};

const PHASE_OUTCOMES: Record<Phase, string> = { cooling: 'cooling', heating: 'heating', resting: 'resting' };

/**
 * Inside the active hours: lets the crib decide the phase, and writes when the phase changes, when the loop first takes hold, or when the hold needs moving. Returns the outcome and what was sent.
 */
async function steer(state: LoopState, thermostat: ThermostatState, cribCelsius: number, range: CribRange): Promise<{ outcome: string; sent: null | Setpoints }> {
  const now = Date.now();
  const current = getCurrentSetpoints(thermostat.target);
  const { mode } = thermostat.target;
  let result: { outcome: string; sent: null | Setpoints } = { outcome: 'paused: changed by a person', sent: null };

  if (state.held !== null && setpointsDiffer(current, state.held.setpoints)) {
    if (now - state.held.atMilliseconds < HOLD_ENDS_AFTER_MILLISECONDS) {
      state.isPaused = true;
      state.switch = null;
    }

    state.held = null;
  }

  if (!state.isPaused && mode === 'off') {
    state.switch = null;
    result = { outcome: 'thermostat is off', sent: null };
  } else if (!state.isPaused) {
    const before = observe(state.switch ?? initialSwitchState(thermostat.activity, now), cribCelsius, now);
    const phase = nextPhase({ cribCelsius, mode, nowMilliseconds: now, range, state: before });
    const after = phase === before.phase ? before : switchTo(before, phase, cribCelsius, now);
    state.switch = after;

    let outcome: null | string = null;
    if (phase !== before.phase) {
      outcome = SWITCH_OUTCOMES[`${before.phase}>${phase}`] ?? phase;
    } else if (state.held === null) {
      outcome = `took hold: ${PHASE_OUTCOMES[phase]}`;
    } else if (needsRecentring(phase, current, thermostat.currentCelsius) || now - state.held.atMilliseconds >= RENEW_HOLD_AFTER_MILLISECONDS) {
      outcome = `moved the hold: ${PHASE_OUTCOMES[phase]}`;
    }

    if (outcome === null) {
      result = { outcome: PHASE_OUTCOMES[phase], sent: null };
    } else {
      const toSend = setpointsFor(phase, thermostat.currentCelsius, mode);
      await write(state, thermostat, toSend);
      result = { outcome, sent: toSend };
    }
  }

  return result;
}

async function decideOnce(): Promise<ThermostatDecisionRecord> {
  const state = getState();
  const decidedAt = new Date().toISOString();
  const [range, schedule] = await Promise.all([getCribRange(), getThermostatSchedule()]);
  const isActive = schedule.isEnabled && isWithinActiveHours(new Date(), schedule.activeFrom, schedule.activeUntil);
  const releaseReason = schedule.isEnabled ? 'outside the active hours' : 'switched off';
  const crib = getTemperature();
  const isCribUsable =
    crib !== null && Date.now() - crib.measuredAt <= CRIB_READING_FRESH_MILLISECONDS && crib.celsius >= LOWEST_SANE_CRIB_CELSIUS && crib.celsius <= HIGHEST_SANE_CRIB_CELSIUS;
  let record: ThermostatDecisionRecord = { ...EMPTY_RECORD, decidedAt, outcome: 'no crib range set' };

  if (!isActive) {
    state.isPaused = false;
  }

  if (range === null) {
    record = { ...record, outcome: await release(state, 'no crib range set', 'no crib range set') };
  } else if (!isCribUsable) {
    record = { ...record, outcome: await release(state, 'crib reading is stale', 'crib reading is stale') };
  } else if (crib !== null) {
    try {
      const thermostat = await readThermostat();
      state.offset = smoothOffset(state.offset, thermostat.currentCelsius - crib.celsius, Date.now(), OFFSET_TIME_CONSTANT_MILLISECONDS);
      const current = getCurrentSetpoints(thermostat.target);
      record = {
        cribCelsius: crib.celsius,
        currentCoolCelsius: current.coolCelsius,
        currentHeatCelsius: current.heatCelsius,
        decidedAt,
        hallwayCelsius: thermostat.currentCelsius,
        mode: thermostat.target.mode,
        offsetCelsius: state.offset.celsius,
        outcome: releaseReason,
        proposedCoolCelsius: null,
        proposedHeatCelsius: null,
      };

      if (isActive) {
        const { outcome, sent } = await steer(state, thermostat, crib.celsius, range);
        record = { ...record, outcome, proposedCoolCelsius: sent?.coolCelsius ?? null, proposedHeatCelsius: sent?.heatCelsius ?? null };
      } else {
        record = { ...record, outcome: await release(state, releaseReason, releaseReason) };
      }
    } catch (error) {
      record = { ...record, cribCelsius: crib.celsius, outcome: `could not reach the thermostat: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  return record;
}

/**
 * Every write and every change of outcome is logged; otherwise one decision every `LOG_EVERY_MILLISECONDS`.
 */
function shouldLog(state: LoopState, record: ThermostatDecisionRecord) {
  const { lastLogged } = state;
  const hasWritten = record.proposedHeatCelsius !== null || record.proposedCoolCelsius !== null;

  return hasWritten || lastLogged === null || lastLogged.outcome !== record.outcome || Date.now() - lastLogged.atMilliseconds >= LOG_EVERY_MILLISECONDS;
}

/**
 * True while a decision is under way, so that a slow one is never overlapped by the next and `held` has one writer.
 */
let isDeciding = false;

async function runOnce() {
  if (isDeciding) {
    console.error('The thermostat loop skipped a decision, because the last one has not finished.');
  } else {
    isDeciding = true;
    try {
      const state = getState();
      const record = await decideOnce();
      if (shouldLog(state, record)) {
        await recordThermostatDecision(record);
        state.lastLogged = { atMilliseconds: Date.now(), outcome: record.outcome };
      }
    } catch (error) {
      console.error('The thermostat loop could not decide.', error);
    } finally {
      // eslint-disable-next-line require-atomic-updates -- Only this decision set it, and only it clears it.
      isDeciding = false;
    }
  }
}

export function startThermostatLoop() {
  if (shared.thermostatLoop === undefined) {
    getState();
    // eslint-disable-next-line promise/prefer-await-to-then -- Started and left running; a camera that cannot be reached only leaves the crib reading stale, which the loop already handles.
    connect().catch(() => {});
    setInterval(runOnce, DECIDE_EVERY_MILLISECONDS);
  }
}
