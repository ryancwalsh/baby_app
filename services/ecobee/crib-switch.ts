import { AUTO_MINIMUM_GAP_CELSIUS, type CribRange, HIGHEST_SETPOINT_CELSIUS, LOWEST_SETPOINT_CELSIUS, roundToTenth, type Setpoints } from '@/services/ecobee/decide';
import { type ThermostatActivity, type ThermostatMode } from '@/services/ecobee/thermostat';

/**
 * The crib switches the furnace: the thermostat is used as an on/off switch, and the crib's own reading decides when to flip it, using the crib range's full width as the gap between switching on and off so that there are as few starts in a night as possible. Pure, so it can be tested without a thermostat; `services/ecobee/loop.ts` feeds it. The goals, the challenges, and why it works this way are in thermostat_control.md.
 */

const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * How far inside the range the crib's coldest and warmest points are aimed (about 0.5 °F).
 */
export const MARGIN_CELSIUS = 0.3;
/**
 * Once started, a run lasts at least this long, unless the crib has gone past the far end of the range.
 */
export const MINIMUM_RUN_MILLISECONDS = 8 * MILLISECONDS_PER_MINUTE;
/**
 * Once stopped, the furnace rests at least this long before the next start, unless the crib has left the range. Every start is heard in the nursery.
 */
export const MINIMUM_REST_MILLISECONDS = 40 * MILLISECONDS_PER_MINUTE;
/**
 * Heating never follows cooling, or cooling heating, within this long, so that a run that overshoots the range is left to drift back rather than answered by the other side: on a winter night a warm crib after a heating run must never start the air conditioner.
 */
export const CHANGEOVER_MILLISECONDS = 3 * 60 * MILLISECONDS_PER_MINUTE;
/**
 * The starting guesses for how far the crib goes on moving the old way after each switch: it goes on cooling briefly after the furnace starts, and goes on warming for a while after it stops (about 1.5 °F after a stop, from the log of 2026-11-27).
 */
export const DEFAULT_LEARNED: Learned = { coolStart: 0.2, coolStop: 0.8, heatStart: 0.2, heatStop: 0.8 };
/**
 * A learned dip or rise is kept within this (about 3 °F), so one odd reading cannot move the thresholds far.
 */
const LARGEST_LEARNED_CELSIUS = 1.7;
const LEARNING_WEIGHT = 0.5;
/**
 * The dip or rise after a switch is over once the crib has turned back by this much, or after this long.
 */
const TURNED_BACK_CELSIUS = 0.2;
const WATCH_FOR_MILLISECONDS = 45 * MILLISECONDS_PER_MINUTE;
/**
 * Never less than this between the start and stop thresholds, so a narrow range does not switch on every reading.
 */
const SMALLEST_THRESHOLD_GAP_CELSIUS = 0.3;
/**
 * While running, the setpoint is this far past the hallway's reading (about 1.5 °F): enough for the ecobee to run, and little enough that it stops by itself soon if the laptop dies. Small also so a furnace with a second stage is not pushed into it.
 */
export const RUNNING_OFFSET_CELSIUS = 0.8;
/**
 * While resting, the setpoints are this far either side of the hallway's reading: half of auto mode's minimum gap, and a little more.
 */
export const RESTING_OFFSET_CELSIUS = AUTO_MINIMUM_GAP_CELSIUS / 2 + 0.05;
/**
 * The hold is moved, relative to the hallway's new reading, when the hallway comes this close to a setpoint, which would otherwise make the ecobee start or stop on its own.
 */
export const RECENTRE_WITHIN_CELSIUS = 0.4;

export type Phase = 'cooling' | 'heating' | 'resting';

export type Transition = 'coolStart' | 'coolStop' | 'heatStart' | 'heatStop';

export type Learned = Record<Transition, number>;

type Watch = { direction: -1 | 1; extremeCelsius: number; fromCelsius: number; sinceMilliseconds: number; transition: Transition };

export type SwitchState = {
  /**
   * The last heating or cooling run and when it ended, for `CHANGEOVER_MILLISECONDS`.
   */
  lastRun: null | { endedAtMilliseconds: number; phase: 'cooling' | 'heating' };
  learned: Learned;
  phase: Phase;
  phaseSinceMilliseconds: number;
  watch: null | Watch;
};

export type Thresholds = { coolStartCelsius: number; coolStopCelsius: number; heatStartCelsius: number; heatStopCelsius: number };

/**
 * After a restart, or when the active hours begin, whatever the ecobee is doing is taken as the phase, so that taking hold does not start or stop anything. A rest is taken to have lasted long enough already.
 */
export function initialSwitchState(activity: ThermostatActivity, nowMilliseconds: number): SwitchState {
  let phase: Phase = 'resting';
  if (activity === 'heating') {
    phase = 'heating';
  } else if (activity === 'cooling') {
    phase = 'cooling';
  }

  return {
    lastRun: null,
    learned: { ...DEFAULT_LEARNED },
    phase,
    phaseSinceMilliseconds: phase === 'resting' ? nowMilliseconds - MINIMUM_REST_MILLISECONDS : nowMilliseconds,
    watch: null,
  };
}

function separate(startCelsius: number, stopCelsius: number, direction: -1 | 1) {
  let thresholds = { startCelsius, stopCelsius };
  if (direction * (stopCelsius - startCelsius) < SMALLEST_THRESHOLD_GAP_CELSIUS) {
    const middle = (startCelsius + stopCelsius) / 2;
    thresholds = { startCelsius: middle - (direction * SMALLEST_THRESHOLD_GAP_CELSIUS) / 2, stopCelsius: middle + (direction * SMALLEST_THRESHOLD_GAP_CELSIUS) / 2 };
  }

  return thresholds;
}

/**
 * Heating starts early by the dip that follows a start and stops early by the rise that follows a stop, so that the crib's coldest and warmest points land about `MARGIN_CELSIUS` inside the range. Cooling is the mirror image.
 */
export function getThresholds(range: CribRange, learned: Learned): Thresholds {
  const heat = separate(range.lowCelsius + MARGIN_CELSIUS + learned.heatStart, range.highCelsius - MARGIN_CELSIUS - learned.heatStop, 1);
  const cool = separate(range.highCelsius - MARGIN_CELSIUS - learned.coolStart, range.lowCelsius + MARGIN_CELSIUS + learned.coolStop, -1);

  return { coolStartCelsius: cool.startCelsius, coolStopCelsius: cool.stopCelsius, heatStartCelsius: heat.startCelsius, heatStopCelsius: heat.stopCelsius };
}

/**
 * The phase the crib calls for now. A run that has started is allowed to finish, and a rest is allowed to last, unless the crib has actually left the range. Heating and cooling never follow each other closely.
 */
export function nextPhase({
  cribCelsius,
  mode,
  nowMilliseconds,
  range,
  state,
}: {
  readonly cribCelsius: number;
  readonly mode: ThermostatMode;
  readonly nowMilliseconds: number;
  readonly range: CribRange;
  readonly state: SwitchState;
}): Phase {
  const thresholds = getThresholds(range, state.learned);
  const elapsed = nowMilliseconds - state.phaseSinceMilliseconds;
  let canHeat = mode === 'heat' || mode === 'auto';
  let canCool = mode === 'cool' || mode === 'auto';
  let phase = state.phase;

  if (state.phase === 'heating') {
    if (!canHeat || (cribCelsius >= thresholds.heatStopCelsius && (elapsed >= MINIMUM_RUN_MILLISECONDS || cribCelsius > range.highCelsius))) {
      phase = 'resting';
    }
  } else if (state.phase === 'cooling') {
    if (!canCool || (cribCelsius <= thresholds.coolStopCelsius && (elapsed >= MINIMUM_RUN_MILLISECONDS || cribCelsius < range.lowCelsius))) {
      phase = 'resting';
    }
  } else {
    const hasRested = elapsed >= MINIMUM_REST_MILLISECONDS;
    const { lastRun } = state;
    const isChangingOver = lastRun !== null && nowMilliseconds - lastRun.endedAtMilliseconds < CHANGEOVER_MILLISECONDS;
    if (isChangingOver && lastRun.phase === 'heating') {
      canCool = false;
    } else if (isChangingOver) {
      canHeat = false;
    }

    if (canHeat && cribCelsius <= thresholds.heatStartCelsius && (hasRested || cribCelsius < range.lowCelsius)) {
      phase = 'heating';
    } else if (canCool && cribCelsius >= thresholds.coolStartCelsius && (hasRested || cribCelsius > range.highCelsius)) {
      phase = 'cooling';
    }
  }

  return phase;
}

/**
 * Which way the crib goes on moving after each switch: still cooling after heating starts, still warming after it stops.
 */
const TRANSITIONS: Record<string, { direction: -1 | 1; transition: Transition }> = {
  'cooling>resting': { direction: -1, transition: 'coolStop' },
  'heating>resting': { direction: 1, transition: 'heatStop' },
  'resting>cooling': { direction: 1, transition: 'coolStart' },
  'resting>heating': { direction: -1, transition: 'heatStart' },
};

function finishWatch(state: SwitchState, watch: Watch, cribCelsius: number): SwitchState {
  const extremeCelsius = watch.direction > 0 ? Math.max(watch.extremeCelsius, cribCelsius) : Math.min(watch.extremeCelsius, cribCelsius);
  const sample = Math.min(LARGEST_LEARNED_CELSIUS, Math.max(0, watch.direction * (extremeCelsius - watch.fromCelsius)));
  const previous = state.learned[watch.transition];

  return { ...state, learned: { ...state.learned, [watch.transition]: previous + LEARNING_WEIGHT * (sample - previous) }, watch: null };
}

/**
 * Follows the crib after a switch, and once it has turned back, folds how far it went into the running average for that switch.
 */
export function observe(state: SwitchState, cribCelsius: number, nowMilliseconds: number): SwitchState {
  let next = state;
  const { watch } = state;

  if (watch !== null) {
    const extremeCelsius = watch.direction > 0 ? Math.max(watch.extremeCelsius, cribCelsius) : Math.min(watch.extremeCelsius, cribCelsius);
    const hasTurnedBack = watch.direction * (extremeCelsius - cribCelsius) >= TURNED_BACK_CELSIUS;

    if (hasTurnedBack || nowMilliseconds - watch.sinceMilliseconds >= WATCH_FOR_MILLISECONDS) {
      next = finishWatch(state, watch, cribCelsius);
    } else {
      next = { ...state, watch: { ...watch, extremeCelsius } };
    }
  }

  return next;
}

/**
 * Folds in whatever the dip or rise after the last switch has reached so far, and starts following the crib after this one.
 */
export function switchTo(state: SwitchState, phase: Phase, cribCelsius: number, nowMilliseconds: number): SwitchState {
  const found = TRANSITIONS[`${state.phase}>${phase}`];
  const settled = state.watch === null ? state : finishWatch(state, state.watch, cribCelsius);

  return {
    ...settled,
    lastRun: state.phase === 'resting' ? state.lastRun : { endedAtMilliseconds: nowMilliseconds, phase: state.phase },
    phase,
    phaseSinceMilliseconds: nowMilliseconds,
    watch:
      found === undefined
        ? null
        : { direction: found.direction, extremeCelsius: cribCelsius, fromCelsius: cribCelsius, sinceMilliseconds: nowMilliseconds, transition: found.transition },
  };
}

function clampSetpoint(celsius: number) {
  return Math.min(HIGHEST_SETPOINT_CELSIUS, Math.max(LOWEST_SETPOINT_CELSIUS, celsius));
}

/**
 * Auto mode's two setpoints, kept inside the hard limits without closing the minimum gap.
 */
function autoSetpoints(heatCelsius: number, coolCelsius: number): Setpoints {
  let heat = heatCelsius;
  let cool = coolCelsius;
  if (cool > HIGHEST_SETPOINT_CELSIUS) {
    cool = HIGHEST_SETPOINT_CELSIUS;
    heat = Math.min(heat, cool - AUTO_MINIMUM_GAP_CELSIUS - 0.05);
  }

  if (heat < LOWEST_SETPOINT_CELSIUS) {
    heat = LOWEST_SETPOINT_CELSIUS;
    cool = Math.max(cool, heat + AUTO_MINIMUM_GAP_CELSIUS + 0.05);
  }

  return { coolCelsius: roundToTenth(cool), heatCelsius: roundToTenth(heat) };
}

/**
 * The setpoints for a phase, placed relative to the hallway's own reading, so that a laptop that dies leaves the ecobee only a little way from where it is.
 */
export function setpointsFor(phase: Phase, hallwayCelsius: number, mode: ThermostatMode): Setpoints {
  let setpoints: Setpoints = { coolCelsius: null, heatCelsius: null };

  if (mode === 'auto' && phase === 'heating') {
    const heatCelsius = hallwayCelsius + RUNNING_OFFSET_CELSIUS;
    setpoints = autoSetpoints(heatCelsius, heatCelsius + AUTO_MINIMUM_GAP_CELSIUS + 0.05);
  } else if (mode === 'auto' && phase === 'cooling') {
    const coolCelsius = hallwayCelsius - RUNNING_OFFSET_CELSIUS;
    setpoints = autoSetpoints(coolCelsius - AUTO_MINIMUM_GAP_CELSIUS - 0.05, coolCelsius);
  } else if (mode === 'auto') {
    setpoints = autoSetpoints(hallwayCelsius - RESTING_OFFSET_CELSIUS, hallwayCelsius + RESTING_OFFSET_CELSIUS);
  } else if (mode === 'heat') {
    setpoints = {
      coolCelsius: null,
      heatCelsius: roundToTenth(clampSetpoint(phase === 'heating' ? hallwayCelsius + RUNNING_OFFSET_CELSIUS : hallwayCelsius - RESTING_OFFSET_CELSIUS)),
    };
  } else if (mode === 'cool') {
    setpoints = {
      coolCelsius: roundToTenth(clampSetpoint(phase === 'cooling' ? hallwayCelsius - RUNNING_OFFSET_CELSIUS : hallwayCelsius + RESTING_OFFSET_CELSIUS)),
      heatCelsius: null,
    };
  }

  return setpoints;
}

/**
 * Whether the hallway has drifted close enough to a setpoint that the ecobee might start or stop on its own, against the phase the loop wants.
 */
export function needsRecentring(phase: Phase, current: Setpoints, hallwayCelsius: number): boolean {
  const { coolCelsius, heatCelsius } = current;
  let isNear = false;

  if (phase === 'heating') {
    isNear = heatCelsius !== null && hallwayCelsius >= heatCelsius - RECENTRE_WITHIN_CELSIUS;
  } else if (phase === 'cooling') {
    isNear = coolCelsius !== null && hallwayCelsius <= coolCelsius + RECENTRE_WITHIN_CELSIUS;
  } else {
    isNear = (heatCelsius !== null && hallwayCelsius <= heatCelsius + RECENTRE_WITHIN_CELSIUS) || (coolCelsius !== null && hallwayCelsius >= coolCelsius - RECENTRE_WITHIN_CELSIUS);
  }

  return isNear;
}
