import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTO_MINIMUM_GAP_CELSIUS, type Setpoints } from '@/services/ecobee/decide';
import { type ThermostatState } from '@/services/ecobee/thermostat';
import { type ThermostatDecisionRecord } from '@/storage/thermostat';

/**
 * A stand-in for the hallway ecobee in auto mode, modelled on what the decision log recorded on the nights of 2026-11-12, 2026-11-13, and 2026-11-14.
 *
 * The ecobee applies thresholds one at a time, in the order they are sent. When a threshold arrives that is closer than its 5 °F deadband to the other one as it stands at that moment, the ecobee splits the shortfall between the two. When the cooling threshold was sent first on a downward step it landed near the old heating threshold, so the cool setpoint ended up about 0.2–0.3 °C above what was written. That model reproduces all four such steps in the log to the tenth: sent 20.1/22.9 from 20.7/23.5 read back 20.1/23.2, sent 19.6/22.4 from 20.2/23.0 read back 19.6/22.7 (three times), and sent 19.7/22.5 from 20.2/23.0 read back 19.7/22.7. It is inferred from those readings, not documented by ecobee.
 *
 * The split does not show at once. A read straight after the write returns what was sent, and the split appears only later: on 2026-11-16 at 21:19 the loop read back right after writing 19.6/22.4, found nothing amiss, and still read 19.6/22.7 ten minutes later. So this fake keeps what was sent visible until `SETTLES_AFTER_MILLISECONDS` have passed.
 */
const SETTLES_AFTER_MILLISECONDS = 1_000;

function roundToTenth(celsius: number) {
  return Math.round(celsius * 10) / 10;
}

function createFakeEcobee(initial: { coolCelsius: number; heatCelsius: number }) {
  const thresholds = { ...initial };
  let unsettled: null | { coolCelsius: number; heatCelsius: number; untilMilliseconds: number } = null;

  function setCool(celsius: number) {
    const shortfall = AUTO_MINIMUM_GAP_CELSIUS - (celsius - thresholds.heatCelsius);
    thresholds.coolCelsius = celsius;
    if (shortfall > 0) {
      thresholds.coolCelsius = roundToTenth(celsius + shortfall / 2);
      thresholds.heatCelsius = roundToTenth(thresholds.heatCelsius - shortfall / 2);
    }
  }

  function setHeat(celsius: number) {
    const shortfall = AUTO_MINIMUM_GAP_CELSIUS - (thresholds.coolCelsius - celsius);
    thresholds.heatCelsius = celsius;
    if (shortfall > 0) {
      thresholds.heatCelsius = roundToTenth(celsius - shortfall / 2);
      thresholds.coolCelsius = roundToTenth(thresholds.coolCelsius + shortfall / 2);
    }
  }

  return {
    read: (hallwayCelsius: number): ThermostatState => {
      const shown = unsettled !== null && Date.now() < unsettled.untilMilliseconds ? unsettled : thresholds;

      return {
        activity: 'idle',
        currentCelsius: hallwayCelsius,
        target: { coolCelsius: shown.coolCelsius, heatCelsius: shown.heatCelsius, mode: 'auto' },
      };
    },
    /**
     * A person changing the setpoints in the ecobee app.
     */
    setByHand: (setpoints: { coolCelsius: number; heatCelsius: number }) => {
      thresholds.coolCelsius = setpoints.coolCelsius;
      thresholds.heatCelsius = setpoints.heatCelsius;
      unsettled = null;
    },
    /**
     * One HomeKit write: the cooling threshold first, then the heating one, as `writeSetpoints` lists them.
     */
    write: (setpoints: Setpoints) => {
      if (setpoints.coolCelsius !== null) {
        setCool(setpoints.coolCelsius);
      }

      if (setpoints.heatCelsius !== null) {
        setHeat(setpoints.heatCelsius);
      }

      unsettled = {
        coolCelsius: setpoints.coolCelsius ?? thresholds.coolCelsius,
        heatCelsius: setpoints.heatCelsius ?? thresholds.heatCelsius,
        untilMilliseconds: Date.now() + SETTLES_AFTER_MILLISECONDS,
      };
    },
  };
}

const MINUTE = 60_000;
/**
 * 66–71 °F, the crib range in use on those nights.
 */
const CRIB_RANGE = { highCelsius: 21.7, lowCelsius: 18.9 };

const environment = vi.hoisted(() => ({
  cribCelsius: 20.2,
  ecobee: null as null | ReturnType<typeof createFakeEcobee>,
  hallwayCelsius: 20.2,
  records: [] as ThermostatDecisionRecord[],
}));

vi.mock('@/services/ecobee/thermostat', () => ({
  clearHold: vi.fn(async () => {}),
  readThermostat: vi.fn(async () => environment.ecobee?.read(environment.hallwayCelsius)),
  writeSetpoints: vi.fn(async (_mode: string, setpoints: Setpoints) => {
    environment.ecobee?.write(setpoints);
  }),
}));

vi.mock('@/services/nanit/connection', () => ({
  connect: vi.fn(async () => {}),
  getTemperature: vi.fn(() => ({ celsius: environment.cribCelsius, measuredAt: Date.now() })),
}));

vi.mock('@/storage/thermostat', () => ({
  getCribRange: vi.fn(async () => CRIB_RANGE),
  getThermostatSchedule: vi.fn(async () => ({ activeFrom: '18:00', activeUntil: '06:00', isEnabled: true })),
  recordThermostatDecision: vi.fn(async (record: ThermostatDecisionRecord) => {
    environment.records.push(record);
  }),
}));

async function startLoop() {
  const { startThermostatLoop } = await import('@/services/ecobee/loop');
  startThermostatLoop();
}

/**
 * Lets the loop make its next decision: the first one comes a minute after start, and the rest every 10 minutes.
 */
async function nextDecision() {
  const count = environment.records.length;
  await vi.advanceTimersByTimeAsync(count === 0 ? MINUTE : 10 * MINUTE);

  return environment.records.at(-1);
}

describe('the thermostat loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    /**
     * 01:09 local time, inside the default 18:00–06:00 active hours, like the step down at 01:10 on 2026-11-15.
     */
    vi.setSystemTime(new Date('2026-11-15T01:09:00'));
    vi.resetModules();
    delete (globalThis as { thermostatLoop?: unknown }).thermostatLoop;
    environment.records = [];
    environment.cribCelsius = 20.2;
    environment.hallwayCelsius = 20.2;
    /**
     * Above the middle of the crib range, so the loop's first decision is a step down.
     */
    environment.ecobee = createFakeEcobee({ coolCelsius: 23.8, heatCelsius: 21 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not take its own step down for a person changing the setpoints', async () => {
    await startLoop();

    const step = await nextDecision();
    expect(step?.outcome).toBe('changed');
    expect({ coolCelsius: step?.proposedCoolCelsius, heatCelsius: step?.proposedHeatCelsius }).toEqual({ coolCelsius: 23.2, heatCelsius: 20.4 });

    const after = await nextDecision();
    expect(after?.outcome).not.toBe('paused: changed by a person');
  });

  it('still pauses when a person changes the setpoints after a step down', async () => {
    await startLoop();
    await nextDecision();

    environment.ecobee?.setByHand({ coolCelsius: 24, heatCelsius: 21 });

    expect((await nextDecision())?.outcome).toBe('paused: changed by a person');
  });

  it('does not take its own step up for a person changing the setpoints', async () => {
    environment.ecobee = createFakeEcobee({ coolCelsius: 22.5, heatCelsius: 19.7 });
    environment.cribCelsius = 17.7;
    environment.hallwayCelsius = 19.7;
    await startLoop();

    expect((await nextDecision())?.outcome).toBe('changed');
    expect((await nextDecision())?.outcome).not.toBe('paused: changed by a person');
  });
});
