import { MILLISECONDS_PER_MINUTE } from '@/constants/time';
import { decide, getCurrentSetpoints, isWithinActiveHours, type Setpoints, setpointsDiffer, smoothOffset, stepSetpoints } from '@/services/ecobee/decide';
import { clearHold, readThermostat, type ThermostatState, writeSetpoints } from '@/services/ecobee/thermostat';
import { connect, getTemperature } from '@/services/nanit/connection';
import { getCribRange, getThermostatSchedule, recordThermostatDecision, type ThermostatDecisionRecord } from '@/storage/thermostat';

/**
 * The worker's loop that steers the hallway ecobee from the crib's temperature. See ecobee_plan.md.
 *
 * Every 10 minutes it reads the crib and the thermostat, decides, and logs the decision to `thermostat_decisions`. Inside the active hours set on the Settings page, and while switched on there, it also writes: it walks the setpoints toward the decision by about 1 °F at a time, and lets go (clears its hold, so the schedule takes over) when the hours end, when it is switched off, or when the crib reading goes stale. A person always wins: if the setpoints are changed by anything but this loop, it leaves the thermostat alone until the active hours next end. Outside the active hours it is a dry run, as before.
 *
 * Started once per worker process by `instrumentation.ts`. It opens the shared Nanit connection, which only ever reads, so the crib reading is there without a phone having a page open.
 */

const DECIDE_EVERY_MILLISECONDS = 10 * MILLISECONDS_PER_MINUTE;
/**
 * Long enough after start for the Nanit connection to have delivered a reading.
 */
const FIRST_DECISION_AFTER_MILLISECONDS = MILLISECONDS_PER_MINUTE;
/**
 * A crib reading older than this is not acted on; the server asks every 30 seconds, so this means something is wrong.
 */
const CRIB_READING_FRESH_MILLISECONDS = 10 * MILLISECONDS_PER_MINUTE;
/**
 * A crib reading outside this is taken for a fault, not a room.
 */
const LOWEST_SANE_CRIB_CELSIUS = 10;
const HIGHEST_SANE_CRIB_CELSIUS = 35;
const OFFSET_TIME_CONSTANT_MILLISECONDS = 30 * MILLISECONDS_PER_MINUTE;
/**
 * The ecobee app's Hold Action is 2 hours, so setpoints that change this long after the loop's last write are taken for its hold ending, not for a person. Measured to the decision before the hold would end.
 */
const HOLD_ENDS_AFTER_MILLISECONDS = 110 * MILLISECONDS_PER_MINUTE;

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
  offset: null | { atMilliseconds: number; celsius: number };
};

/**
 * Kept on `globalThis` so that a module loaded twice, as Next can do, still runs one loop.
 */
const shared = globalThis as typeof globalThis & { thermostatLoop?: LoopState };

function getState() {
  shared.thermostatLoop ??= { held: null, isPaused: false, offset: null };

  return shared.thermostatLoop;
}

/**
 * Clears the loop's hold if it has one, and says so in the outcome.
 */
async function release(state: LoopState, reason: string, otherwise: string) {
  let outcome = otherwise;
  if (state.held !== null) {
    await clearHold();
    // eslint-disable-next-line require-atomic-updates -- runOnce never lets two decisions overlap, so nothing else changes `held` meanwhile.
    state.held = null;
    outcome = `released: ${reason}`;
  }

  return outcome;
}

/**
 * Inside the active hours: writes the next step toward the decision, unless a person has taken over. Returns the outcome and what was sent.
 */
async function steer(state: LoopState, thermostat: ThermostatState, proposed: Setpoints): Promise<{ outcome: string; sent: null | Setpoints }> {
  const current = getCurrentSetpoints(thermostat.target);
  let result: { outcome: string; sent: null | Setpoints } = { outcome: 'paused: changed by a person', sent: null };

  if (state.held !== null && setpointsDiffer(current, state.held.setpoints) && Date.now() - state.held.atMilliseconds < HOLD_ENDS_AFTER_MILLISECONDS) {
    state.isPaused = true;
    state.held = null;
  }

  if (!state.isPaused && thermostat.target.mode === 'off') {
    result = { outcome: 'thermostat is off', sent: null };
  } else if (!state.isPaused) {
    /**
     * After the hold has ended the schedule's setpoints are back, so the walk resumes from where the loop had got to rather than from the schedule.
     */
    const from = state.held !== null && setpointsDiffer(current, state.held.setpoints) ? state.held.setpoints : current;
    const next = stepSetpoints(from, proposed, thermostat.target.mode);
    const toSend = next ?? (from === current ? null : from);

    if (toSend === null) {
      result = { outcome: 'left as it is', sent: null };
    } else {
      await writeSetpoints(thermostat.target.mode, toSend);
      // eslint-disable-next-line require-atomic-updates -- runOnce never lets two decisions overlap, so nothing else changes `held` meanwhile.
      state.held = { atMilliseconds: Date.now(), setpoints: toSend };
      result = { outcome: 'changed', sent: toSend };
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
      const decision = decide(range, state.offset.celsius, thermostat.target);
      const current = getCurrentSetpoints(thermostat.target);
      record = {
        cribCelsius: crib.celsius,
        currentCoolCelsius: current.coolCelsius,
        currentHeatCelsius: current.heatCelsius,
        decidedAt,
        hallwayCelsius: thermostat.currentCelsius,
        mode: thermostat.target.mode,
        offsetCelsius: state.offset.celsius,
        outcome: decision.outcome,
        proposedCoolCelsius: decision.proposed.coolCelsius,
        proposedHeatCelsius: decision.proposed.heatCelsius,
      };

      if (isActive) {
        const { outcome, sent } = await steer(state, thermostat, decision.proposed);
        record = { ...record, outcome, proposedCoolCelsius: sent?.coolCelsius ?? null, proposedHeatCelsius: sent?.heatCelsius ?? null };
      } else {
        record = { ...record, outcome: await release(state, releaseReason, decision.outcome) };
      }
    } catch (error) {
      record = { ...record, cribCelsius: crib.celsius, outcome: `could not reach the thermostat: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  return record;
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
      await recordThermostatDecision(await decideOnce());
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
    setTimeout(runOnce, FIRST_DECISION_AFTER_MILLISECONDS);
    setInterval(runOnce, DECIDE_EVERY_MILLISECONDS);
  }
}
