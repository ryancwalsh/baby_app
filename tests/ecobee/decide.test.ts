import { describe, expect, it } from 'vitest';

import {
  AUTO_MINIMUM_GAP_CELSIUS,
  decide,
  HIGHEST_SETPOINT_CELSIUS,
  isWithinActiveHours,
  LOWEST_SETPOINT_CELSIUS,
  setpointsDiffer,
  smoothOffset,
  stepSetpoints,
} from '@/services/ecobee/decide';

const RANGE = { highCelsius: 22, lowCelsius: 20 };
const MINUTE = 60_000;

describe('decide', () => {
  it('shifts both ends of the crib range by the offset in auto mode', () => {
    const decision = decide({ highCelsius: 23, lowCelsius: 19 }, 1, { coolCelsius: 22.8, heatCelsius: 18.3, mode: 'auto' });

    expect(decision.proposed).toEqual({ coolCelsius: 24, heatCelsius: 20 });
    expect(decision.outcome).toBe('would change');
  });

  it('widens a range narrower than ecobee allows in auto mode, around its middle', () => {
    const { proposed } = decide(RANGE, 0, { coolCelsius: 22.8, heatCelsius: 18.3, mode: 'auto' });

    expect((proposed.coolCelsius ?? 0) - (proposed.heatCelsius ?? 0)).toBeCloseTo(AUTO_MINIMUM_GAP_CELSIUS, 1);
    expect(((proposed.coolCelsius ?? 0) + (proposed.heatCelsius ?? 0)) / 2).toBeCloseTo(21, 1);
  });

  it('does not widen in heat mode, and proposes only the heat setpoint', () => {
    const decision = decide(RANGE, -0.5, { celsius: 18, mode: 'heat' });

    expect(decision.proposed).toEqual({ coolCelsius: null, heatCelsius: 19.5 });
  });

  it('proposes only the cool setpoint in cool mode', () => {
    expect(decide(RANGE, 0, { celsius: 22, mode: 'cool' }).proposed).toEqual({ coolCelsius: 22, heatCelsius: null });
  });

  it('never proposes a setpoint outside the hard limits', () => {
    const tooWarm = decide(RANGE, 10, { celsius: 20, mode: 'heat' });
    const tooCold = decide(RANGE, -10, { celsius: 20, mode: 'cool' });

    expect(tooWarm.proposed.heatCelsius).toBe(HIGHEST_SETPOINT_CELSIUS);
    expect(tooCold.proposed.coolCelsius).toBe(LOWEST_SETPOINT_CELSIUS);
  });

  it('leaves a setpoint that would move by less than about 1 °F', () => {
    expect(decide(RANGE, 0, { celsius: 19.7, mode: 'heat' }).outcome).toBe('would leave');
    expect(decide(RANGE, 0, { celsius: 19.5, mode: 'heat' }).outcome).toBe('would change');
  });

  it('does nothing while the thermostat is off', () => {
    expect(decide(RANGE, 0, { mode: 'off' })).toEqual({ outcome: 'thermostat is off', proposed: { coolCelsius: null, heatCelsius: null } });
  });
});

describe('smoothOffset', () => {
  it('starts from the first reading', () => {
    expect(smoothOffset(null, 2, 0, 30 * MINUTE)).toEqual({ atMilliseconds: 0, celsius: 2 });
  });

  it('moves part of the way toward a new reading', () => {
    const smoothed = smoothOffset({ atMilliseconds: 0, celsius: 0 }, 3, 10 * MINUTE, 30 * MINUTE);

    expect(smoothed.celsius).toBeGreaterThan(0.5);
    expect(smoothed.celsius).toBeLessThan(1.5);
  });

  it('starts afresh after a gap as long as the time constant', () => {
    expect(smoothOffset({ atMilliseconds: 0, celsius: 0 }, 3, 30 * MINUTE, 30 * MINUTE).celsius).toBe(3);
  });
});

describe('stepSetpoints', () => {
  it('moves each setpoint toward the proposal by at most one step of MAXIMUM_STEP_CELSIUS', () => {
    expect(stepSetpoints({ coolCelsius: 22.8, heatCelsius: 18.9 }, { coolCelsius: 23.5, heatCelsius: 20.8 }, 'auto')).toEqual({
      coolCelsius: 23.4,
      heatCelsius: 19.5,
    });
  });

  it('lands on a proposal that is within a step', () => {
    expect(stepSetpoints({ coolCelsius: null, heatCelsius: 20 }, { coolCelsius: null, heatCelsius: 19.4 }, 'heat')).toEqual({ coolCelsius: null, heatCelsius: 19.4 });
  });

  it('pushes the cool setpoint up when a heat step would close the gap auto mode needs', () => {
    const stepped = stepSetpoints({ coolCelsius: 21.6, heatCelsius: 18.9 }, { coolCelsius: 21.6, heatCelsius: 19.5 }, 'auto');

    expect((stepped?.coolCelsius ?? 0) - (stepped?.heatCelsius ?? 0)).toBeGreaterThanOrEqual(AUTO_MINIMUM_GAP_CELSIUS);
  });

  it('sends nothing when no setpoint would move by about 1 °F', () => {
    expect(stepSetpoints({ coolCelsius: 22.8, heatCelsius: 18.9 }, { coolCelsius: 22.9, heatCelsius: 19.1 }, 'auto')).toBeNull();
  });
});

describe('setpointsDiffer', () => {
  it('allows for the thermostat rounding what was written', () => {
    expect(setpointsDiffer({ coolCelsius: 22.8, heatCelsius: 20.8 }, { coolCelsius: 22.7, heatCelsius: 20.9 })).toBe(false);
  });

  it('notices a setpoint changed by someone else', () => {
    expect(setpointsDiffer({ coolCelsius: 22.8, heatCelsius: 18.9 }, { coolCelsius: 22.8, heatCelsius: 20.6 })).toBe(true);
  });
});

function at(time: string) {
  return new Date(`2026-11-12T${time}:00`);
}

describe('isWithinActiveHours', () => {
  it('runs past midnight', () => {
    expect(isWithinActiveHours(at('18:00'), '18:00', '06:00')).toBe(true);
    expect(isWithinActiveHours(at('23:59'), '18:00', '06:00')).toBe(true);
    expect(isWithinActiveHours(at('03:00'), '18:00', '06:00')).toBe(true);
    expect(isWithinActiveHours(at('06:00'), '18:00', '06:00')).toBe(false);
    expect(isWithinActiveHours(at('12:00'), '18:00', '06:00')).toBe(false);
  });

  it('works within one day', () => {
    expect(isWithinActiveHours(at('13:00'), '12:00', '15:00')).toBe(true);
    expect(isWithinActiveHours(at('15:00'), '12:00', '15:00')).toBe(false);
  });

  it('is never active when the start and end are the same', () => {
    expect(isWithinActiveHours(at('18:00'), '18:00', '18:00')).toBe(false);
  });
});
