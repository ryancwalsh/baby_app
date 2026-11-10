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
