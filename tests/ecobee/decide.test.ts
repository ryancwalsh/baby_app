import { describe, expect, it } from 'vitest';

import { isWithinActiveHours, setpointsDiffer, smoothOffset } from '@/services/ecobee/decide';

const MINUTE = 60_000;

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
