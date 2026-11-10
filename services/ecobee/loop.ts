import { MILLISECONDS_PER_MINUTE } from '@/constants/time';
import { decide, getCurrentSetpoints, smoothOffset } from '@/services/ecobee/decide';
import { readThermostat } from '@/services/ecobee/thermostat';
import { connect, getTemperature } from '@/services/nanit/connection';
import { getCribRange, recordThermostatDecision, type ThermostatDecisionRecord } from '@/storage/thermostat';

/**
 * The worker's loop that steers the hallway ecobee from the crib's temperature. **Dry run**: it reads the crib and the thermostat, decides, and logs the decision to `thermostat_decisions`, but writes nothing to the thermostat. See phase 2 of ecobee_plan.md.
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
const OFFSET_TIME_CONSTANT_MILLISECONDS = 30 * MILLISECONDS_PER_MINUTE;

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

/**
 * Kept on `globalThis` so that a module loaded twice, as Next can do, still runs one loop.
 */
const shared = globalThis as typeof globalThis & {
  thermostatLoop?: { offset: null | { atMilliseconds: number; celsius: number } };
};

async function decideOnce(): Promise<ThermostatDecisionRecord> {
  const state = shared.thermostatLoop ?? { offset: null };
  const decidedAt = new Date().toISOString();
  const range = await getCribRange();
  const crib = getTemperature();
  let record: ThermostatDecisionRecord = { ...EMPTY_RECORD, decidedAt, outcome: 'no crib range set' };

  if (range !== null && (crib === null || Date.now() - crib.measuredAt > CRIB_READING_FRESH_MILLISECONDS)) {
    record = { ...record, outcome: 'crib reading is stale' };
  } else if (range !== null && crib !== null) {
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
    } catch (error) {
      record = { ...record, cribCelsius: crib.celsius, outcome: `could not read the thermostat: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  return record;
}

async function runOnce() {
  try {
    await recordThermostatDecision(await decideOnce());
  } catch (error) {
    console.error('The thermostat loop could not decide.', error);
  }
}

export function startThermostatLoop() {
  if (shared.thermostatLoop === undefined) {
    shared.thermostatLoop = { offset: null };
    // eslint-disable-next-line promise/prefer-await-to-then -- Started and left running; a camera that cannot be reached only leaves the crib reading stale, which the loop already handles.
    connect().catch(() => {});
    setTimeout(runOnce, FIRST_DECISION_AFTER_MILLISECONDS);
    setInterval(runOnce, DECIDE_EVERY_MILLISECONDS);
  }
}
