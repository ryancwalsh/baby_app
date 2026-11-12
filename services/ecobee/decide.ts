import { type ThermostatState } from '@/services/ecobee/thermostat';

/**
 * How the worker chooses the hallway thermostat's setpoints from the crib's temperature. Pure, so it can be tested without a thermostat; `services/ecobee/loop.ts` feeds it.
 *
 * The thermostat is good at holding the hallway at a setpoint; it just measures the wrong room. So rather than switching heating or cooling on and off, this learns how far the hallway is from the crib and shifts the crib's range by that much.
 */

/**
 * The setpoints are never sent outside this, whatever the arithmetic says: 61–79 °F.
 */
export const LOWEST_SETPOINT_CELSIUS = 16;
export const HIGHEST_SETPOINT_CELSIUS = 26;
/**
 * Ecobee's auto mode keeps its heat and cool setpoints at least this far apart (5 °F by default), so a narrower range is widened around its middle.
 */
export const AUTO_MINIMUM_GAP_CELSIUS = (5 * 5) / 9;
/**
 * A setpoint is only changed when it would move by at least this much (about 1 °F), so the thermostat is not nudged all night.
 */
export const MINIMUM_CHANGE_CELSIUS = 0.5;

export type CribRange = { highCelsius: number; lowCelsius: number };

export type Setpoints = { coolCelsius: null | number; heatCelsius: null | number };

export type Decision = {
  outcome: 'thermostat is off' | 'would change' | 'would leave';
  proposed: Setpoints;
};

function clamp(celsius: number) {
  return Math.min(HIGHEST_SETPOINT_CELSIUS, Math.max(LOWEST_SETPOINT_CELSIUS, celsius));
}

function roundToTenth(celsius: number) {
  return Math.round(celsius * 10) / 10;
}

/**
 * An exponential moving average with a time constant rather than a fixed weight, so it smooths the same whatever the gap between readings. A first reading, or one after a long gap, starts afresh.
 */
export function smoothOffset(previous: null | { atMilliseconds: number; celsius: number }, celsius: number, atMilliseconds: number, timeConstantMilliseconds: number) {
  let smoothed = celsius;
  if (previous !== null && atMilliseconds - previous.atMilliseconds < timeConstantMilliseconds) {
    const weight = 1 - Math.exp(-(atMilliseconds - previous.atMilliseconds) / timeConstantMilliseconds);
    smoothed = previous.celsius + weight * (celsius - previous.celsius);
  }

  return { atMilliseconds, celsius: smoothed };
}

export function getCurrentSetpoints(target: ThermostatState['target']): Setpoints {
  let setpoints: Setpoints = { coolCelsius: null, heatCelsius: null };
  if (target.mode === 'auto') {
    setpoints = { coolCelsius: target.coolCelsius, heatCelsius: target.heatCelsius };
  } else if (target.mode === 'heat') {
    setpoints = { coolCelsius: null, heatCelsius: target.celsius };
  } else if (target.mode === 'cool') {
    setpoints = { coolCelsius: target.celsius, heatCelsius: null };
  }

  return setpoints;
}

function moves(proposedCelsius: null | number, currentCelsius: null | number) {
  return proposedCelsius !== null && currentCelsius !== null && Math.abs(proposedCelsius - currentCelsius) >= MINIMUM_CHANGE_CELSIUS;
}

/**
 * The setpoints that should put the crib in its range, for the thermostat's current mode, which this never changes. `offsetCelsius` is the hallway minus the crib.
 */
export function decide(range: CribRange, offsetCelsius: number, target: ThermostatState['target']): Decision {
  let heatCelsius = clamp(range.lowCelsius + offsetCelsius);
  let coolCelsius = clamp(range.highCelsius + offsetCelsius);

  if (target.mode === 'auto' && coolCelsius - heatCelsius < AUTO_MINIMUM_GAP_CELSIUS) {
    const middle = (heatCelsius + coolCelsius) / 2;
    heatCelsius = clamp(middle - AUTO_MINIMUM_GAP_CELSIUS / 2);
    coolCelsius = Math.min(HIGHEST_SETPOINT_CELSIUS, heatCelsius + AUTO_MINIMUM_GAP_CELSIUS);
    heatCelsius = coolCelsius - AUTO_MINIMUM_GAP_CELSIUS;
  }

  const proposed: Setpoints = {
    coolCelsius: target.mode === 'cool' || target.mode === 'auto' ? roundToTenth(coolCelsius) : null,
    heatCelsius: target.mode === 'heat' || target.mode === 'auto' ? roundToTenth(heatCelsius) : null,
  };
  const current = getCurrentSetpoints(target);

  let outcome: Decision['outcome'] = 'would leave';
  if (target.mode === 'off') {
    outcome = 'thermostat is off';
  } else if (moves(proposed.heatCelsius, current.heatCelsius) || moves(proposed.coolCelsius, current.coolCelsius)) {
    outcome = 'would change';
  }

  return { outcome, proposed };
}

/**
 * The most a setpoint is moved in one decision (about 1 °F), so the hallway is walked toward a new setpoint rather than jumped. The crib went on warming for at least 10 minutes after heating stopped on 2026-11-12, so a jump overshoots it.
 */
export const MAXIMUM_STEP_CELSIUS = 0.6;
/**
 * How far a setpoint read back may be from what was written and still count as the same, allowing for the thermostat's own rounding.
 */
export const SAME_SETPOINT_TOLERANCE_CELSIUS = 0.3;

function stepToward(currentCelsius: null | number, proposedCelsius: null | number) {
  let stepped = proposedCelsius;
  if (currentCelsius !== null && proposedCelsius !== null) {
    stepped = roundToTenth(currentCelsius + Math.max(-MAXIMUM_STEP_CELSIUS, Math.min(MAXIMUM_STEP_CELSIUS, proposedCelsius - currentCelsius)));
  }

  return stepped;
}

/**
 * The setpoints to send now: each moved from where it is toward the proposal by at most MAXIMUM_STEP_CELSIUS, with the cool setpoint pushed up if auto mode's gap needs it, and nothing sent unless something moves by at least MINIMUM_CHANGE_CELSIUS.
 */
export function stepSetpoints(current: Setpoints, proposed: Setpoints, mode: ThermostatState['target']['mode']): null | Setpoints {
  const heatCelsius = stepToward(current.heatCelsius, proposed.heatCelsius);
  let coolCelsius = stepToward(current.coolCelsius, proposed.coolCelsius);
  if (mode === 'auto' && heatCelsius !== null && coolCelsius !== null && coolCelsius - heatCelsius < AUTO_MINIMUM_GAP_CELSIUS) {
    coolCelsius = roundToTenth(Math.min(HIGHEST_SETPOINT_CELSIUS, heatCelsius + AUTO_MINIMUM_GAP_CELSIUS + 0.05));
  }

  return moves(heatCelsius, current.heatCelsius) || moves(coolCelsius, current.coolCelsius) ? { coolCelsius, heatCelsius } : null;
}

function differs(readCelsius: null | number, writtenCelsius: null | number) {
  return readCelsius !== null && writtenCelsius !== null && Math.abs(readCelsius - writtenCelsius) > SAME_SETPOINT_TOLERANCE_CELSIUS;
}

/**
 * Whether the thermostat no longer holds what the loop last wrote, which means a person changed it or the hold ended.
 */
export function setpointsDiffer(read: Setpoints, written: Setpoints) {
  return differs(read.heatCelsius, written.heatCelsius) || differs(read.coolCelsius, written.coolCelsius);
}

const TIME_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

export function isTimeOfDay(value: string) {
  return TIME_OF_DAY_PATTERN.test(value);
}

/**
 * Whether a local time falls in the active hours, which may run past midnight (18:00 to 06:00). The start is inside and the end is not; equal times mean never.
 */
function toMinuteOfDay(timeOfDay: string) {
  return Number(timeOfDay.slice(0, 2)) * 60 + Number(timeOfDay.slice(3, 5));
}

export function isWithinActiveHours(now: Date, activeFrom: string, activeUntil: string) {
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const from = toMinuteOfDay(activeFrom);
  const until = toMinuteOfDay(activeUntil);

  return from <= until ? nowMinute >= from && nowMinute < until : nowMinute >= from || nowMinute < until;
}
