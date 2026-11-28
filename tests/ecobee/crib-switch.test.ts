import { describe, expect, it } from 'vitest';

import {
  CHANGEOVER_MILLISECONDS,
  DEFAULT_LEARNED,
  getThresholds,
  initialSwitchState,
  MINIMUM_REST_MILLISECONDS,
  MINIMUM_RUN_MILLISECONDS,
  needsRecentring,
  nextPhase,
  observe,
  RESTING_OFFSET_CELSIUS,
  RUNNING_OFFSET_CELSIUS,
  setpointsFor,
  type SwitchState,
  switchTo,
} from '@/services/ecobee/crib-switch';
import { AUTO_MINIMUM_GAP_CELSIUS, HIGHEST_SETPOINT_CELSIUS } from '@/services/ecobee/decide';

/**
 * An example range. With the default guesses, heating starts at 19.5 °C and stops at 20.9 °C.
 */
const RANGE = { highCelsius: 22, lowCelsius: 19 };
const MINUTE = 60_000;
const NOW = 1_000 * MINUTE;

function resting(sinceMilliseconds = NOW - MINIMUM_REST_MILLISECONDS): SwitchState {
  return { lastRun: null, learned: { ...DEFAULT_LEARNED }, phase: 'resting', phaseSinceMilliseconds: sinceMilliseconds, watch: null };
}

function heating(sinceMilliseconds: number): SwitchState {
  return { ...resting(), phase: 'heating', phaseSinceMilliseconds: sinceMilliseconds };
}

describe('getThresholds', () => {
  it('starts heating just above the low end and stops well before the high end, allowing for the dip and the rise', () => {
    const thresholds = getThresholds(RANGE, DEFAULT_LEARNED);

    expect(thresholds.heatStartCelsius).toBeCloseTo(19.5);
    expect(thresholds.heatStopCelsius).toBeCloseTo(20.9);
    expect(thresholds.coolStartCelsius).toBeCloseTo(21.5);
    expect(thresholds.coolStopCelsius).toBeCloseTo(20.1);
  });

  it('keeps a gap between starting and stopping when the range is narrow', () => {
    const thresholds = getThresholds({ highCelsius: 20, lowCelsius: 19.5 }, DEFAULT_LEARNED);

    expect(thresholds.heatStopCelsius - thresholds.heatStartCelsius).toBeCloseTo(0.3);
    expect(thresholds.coolStartCelsius - thresholds.coolStopCelsius).toBeCloseTo(0.3);
  });
});

describe('nextPhase', () => {
  it('leaves a crib in the middle of the range alone', () => {
    expect(nextPhase({ cribCelsius: 20, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: resting() })).toBe('resting');
  });

  it('starts heating when the crib nears the low end, after a long enough rest', () => {
    expect(nextPhase({ cribCelsius: 19.5, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: resting() })).toBe('heating');
  });

  it('waits out the rest unless the crib has left the range', () => {
    const justStopped = resting(NOW - 5 * MINUTE);

    expect(nextPhase({ cribCelsius: 19.4, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: justStopped })).toBe('resting');
    expect(nextPhase({ cribCelsius: 18.9, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: justStopped })).toBe('heating');
  });

  it('lets a run go on through the middle of the range and stops it near the top', () => {
    const running = heating(NOW - 20 * MINUTE);

    expect(nextPhase({ cribCelsius: 20.3, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: running })).toBe('heating');
    expect(nextPhase({ cribCelsius: 20.9, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: running })).toBe('resting');
  });

  it('finishes the minimum run unless the crib has gone past the high end', () => {
    const justStarted = heating(NOW - MINUTE);

    expect(nextPhase({ cribCelsius: 21, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: justStarted })).toBe('heating');
    expect(nextPhase({ cribCelsius: 22.1, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: justStarted })).toBe('resting');
    expect(nextPhase({ cribCelsius: 21, mode: 'auto', nowMilliseconds: NOW + MINIMUM_RUN_MILLISECONDS, range: RANGE, state: justStarted })).toBe('resting');
  });

  it('cools near the high end in auto or cool mode, never in heat mode', () => {
    expect(nextPhase({ cribCelsius: 21.6, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: resting() })).toBe('cooling');
    expect(nextPhase({ cribCelsius: 21.6, mode: 'heat', nowMilliseconds: NOW, range: RANGE, state: resting() })).toBe('resting');
  });

  it('never answers a heating overshoot with cooling soon afterwards', () => {
    const afterHeating = switchTo(heating(NOW - 20 * MINUTE), 'resting', 20.9, NOW - 50 * MINUTE);

    expect(nextPhase({ cribCelsius: 22.3, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: afterHeating })).toBe('resting');
    expect(nextPhase({ cribCelsius: 22.3, mode: 'auto', nowMilliseconds: NOW - 50 * MINUTE + CHANGEOVER_MILLISECONDS, range: RANGE, state: afterHeating })).toBe('cooling');
  });

  it('never heats in cool mode', () => {
    expect(nextPhase({ cribCelsius: 18, mode: 'cool', nowMilliseconds: NOW, range: RANGE, state: resting() })).toBe('resting');
  });
});

describe('initialSwitchState', () => {
  it('takes whatever the ecobee is doing as the phase, so taking hold starts or stops nothing', () => {
    expect(initialSwitchState('heating', NOW).phase).toBe('heating');
    expect(initialSwitchState('idle', NOW).phase).toBe('resting');
    expect(nextPhase({ cribCelsius: 19.5, mode: 'auto', nowMilliseconds: NOW, range: RANGE, state: initialSwitchState('idle', NOW) })).toBe('heating');
  });
});

describe('observe', () => {
  it('learns how far the crib went on warming after heating stopped', () => {
    let state = switchTo(heating(NOW - 30 * MINUTE), 'resting', 20.9, NOW);
    state = observe(state, 21.5, NOW + 5 * MINUTE);
    state = observe(state, 21.9, NOW + 10 * MINUTE);
    expect(state.learned.heatStop).toBe(DEFAULT_LEARNED.heatStop);

    state = observe(state, 21.6, NOW + 15 * MINUTE);
    expect(state.watch).toBeNull();
    expect(state.learned.heatStop).toBeCloseTo(DEFAULT_LEARNED.heatStop + 0.5 * (1 - DEFAULT_LEARNED.heatStop));
  });

  it('learns how far the crib went on cooling after heating started', () => {
    let state = switchTo(resting(), 'heating', 19.5, NOW);
    state = observe(state, 19.1, NOW + 3 * MINUTE);
    state = observe(state, 19.4, NOW + 6 * MINUTE);

    expect(state.learned.heatStart).toBeCloseTo(DEFAULT_LEARNED.heatStart + 0.5 * (0.4 - DEFAULT_LEARNED.heatStart));
  });
});

describe('setpointsFor', () => {
  it('puts the heat setpoint a little above the hallway while heating, keeping the auto gap', () => {
    const setpoints = setpointsFor('heating', 20, 'auto');

    expect(setpoints.heatCelsius).toBeCloseTo(20 + RUNNING_OFFSET_CELSIUS, 1);
    expect((setpoints.coolCelsius ?? 0) - (setpoints.heatCelsius ?? 0)).toBeGreaterThanOrEqual(AUTO_MINIMUM_GAP_CELSIUS);
  });

  it('puts the setpoints either side of the hallway while resting', () => {
    const setpoints = setpointsFor('resting', 20, 'auto');

    expect(setpoints.heatCelsius).toBeCloseTo(20 - RESTING_OFFSET_CELSIUS, 1);
    expect(setpoints.coolCelsius).toBeCloseTo(20 + RESTING_OFFSET_CELSIUS, 1);
    expect((setpoints.coolCelsius ?? 0) - (setpoints.heatCelsius ?? 0)).toBeGreaterThanOrEqual(AUTO_MINIMUM_GAP_CELSIUS);
  });

  it('sends only the one setpoint in heat mode', () => {
    expect(setpointsFor('heating', 20, 'heat')).toEqual({ coolCelsius: null, heatCelsius: 20.8 });
  });

  it('stays inside the hard limits without closing the auto gap', () => {
    const setpoints = setpointsFor('heating', 25.5, 'auto');

    expect(setpoints.coolCelsius).toBe(HIGHEST_SETPOINT_CELSIUS);
    expect((setpoints.coolCelsius ?? 0) - (setpoints.heatCelsius ?? 0)).toBeGreaterThanOrEqual(AUTO_MINIMUM_GAP_CELSIUS);
  });
});

describe('needsRecentring', () => {
  it('moves the hold when the hallway nears the heat setpoint during a run, or nears either setpoint during a rest', () => {
    expect(needsRecentring('heating', { coolCelsius: 23.6, heatCelsius: 20.8 }, 20)).toBe(false);
    expect(needsRecentring('heating', { coolCelsius: 23.6, heatCelsius: 20.8 }, 20.5)).toBe(true);
    expect(needsRecentring('resting', { coolCelsius: 21.4, heatCelsius: 18.6 }, 20)).toBe(false);
    expect(needsRecentring('resting', { coolCelsius: 21.4, heatCelsius: 18.6 }, 18.9)).toBe(true);
  });
});
