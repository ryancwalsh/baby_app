import { describe, expect, it } from 'vitest';

import { AUTO_MINIMUM_GAP_CELSIUS, decide, HIGHEST_SETPOINT_CELSIUS, LOWEST_SETPOINT_CELSIUS, smoothOffset } from '@/services/ecobee/decide';

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
