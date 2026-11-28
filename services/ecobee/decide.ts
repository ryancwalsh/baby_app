import { type ThermostatState } from '@/services/ecobee/thermostat';

/**
 * The shared pieces of how the worker steers the hallway thermostat: the hard limits, auto mode's gap, the active hours, and how what the loop wrote is compared with what the thermostat holds. The switching itself is in `services/ecobee/crib-switch.ts`, and why it works the way it does is in thermostat_control.md.
 */

/**
 * The setpoints are never sent outside this, whatever the arithmetic says: 61–79 °F.
 */
export const LOWEST_SETPOINT_CELSIUS = 16;
export const HIGHEST_SETPOINT_CELSIUS = 26;
/**
 * Ecobee's auto mode keeps its heat and cool setpoints at least this far apart (5 °F by default).
 */
export const AUTO_MINIMUM_GAP_CELSIUS = (5 * 5) / 9;

export type CribRange = { highCelsius: number; lowCelsius: number };

export type Setpoints = { coolCelsius: null | number; heatCelsius: null | number };

export function roundToTenth(celsius: number) {
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

/**
 * How far a setpoint read back may be from what was written and still count as the same, allowing for the thermostat's own rounding.
 */
export const SAME_SETPOINT_TOLERANCE_CELSIUS = 0.3;

/**
 * The setpoints split into two writes in auto mode, in an order that never brings the cooling threshold inside the gap from the heating one as it stands. The ecobee applies thresholds one at a time and, when one arrives inside the gap, pushes the two apart: sending the cool setpoint first on a step down left it about 0.3 °C above what was sent, which the loop took for a person on 2026-11-13, 2026-11-14, 2026-11-15, and 2026-11-16. So when the cool setpoint is going down, the heat setpoint goes first; otherwise the cool one does.
 */
export function orderForWriting(current: Setpoints, next: Setpoints): Setpoints[] {
  const cool = { coolCelsius: next.coolCelsius, heatCelsius: null };
  const heat = { coolCelsius: null, heatCelsius: next.heatCelsius };
  const isCoolGoingDown = current.coolCelsius !== null && next.coolCelsius !== null && next.coolCelsius < current.coolCelsius;

  return isCoolGoingDown ? [heat, cool] : [cool, heat];
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
