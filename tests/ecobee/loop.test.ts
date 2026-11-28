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
        activity: hallwayCelsius < shown.heatCelsius ? 'heating' : hallwayCelsius > shown.coolCelsius ? 'cooling' : 'idle',
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
 * An example crib range, 66–71 °F. With the default guesses, heating starts at about 19.4 °C and stops at about 20.6 °C.
 */
const CRIB_RANGE = { highCelsius: 21.7, lowCelsius: 18.9 };

const environment = vi.hoisted(() => ({
  cribCelsius: 20.2,
  ecobee: null as null | ReturnType<typeof createFakeEcobee>,
  hallwayCelsius: 20.2,
  records: [] as ThermostatDecisionRecord[],
}));

const thermostat = vi.hoisted(() => ({
  clearHold: vi.fn(async () => {}),
  readThermostat: vi.fn(async () => environment.ecobee?.read(environment.hallwayCelsius)),
  writeSetpoints: vi.fn(async (_mode: string, setpoints: Setpoints) => {
    environment.ecobee?.write(setpoints);
  }),
}));

vi.mock('@/services/ecobee/thermostat', () => thermostat);

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
 * Lets the loop make its next decisions, one a minute (the first a minute after start), and returns the last decision logged.
 */
async function decide(count = 1) {
  await vi.advanceTimersByTimeAsync(count * MINUTE);

  return environment.records.at(-1);
}

function lastSent() {
  const record = environment.records.at(-1);

  return { coolCelsius: record?.proposedCoolCelsius, heatCelsius: record?.proposedHeatCelsius };
}

describe('the thermostat loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    /**
     * 01:09 local time, inside the 18:00–06:00 active hours.
     */
    vi.setSystemTime(new Date('2026-11-15T01:09:00'));
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as { thermostatLoop?: unknown }).thermostatLoop;
    environment.records = [];
    environment.cribCelsius = 20.2;
    environment.hallwayCelsius = 20.2;
    /**
     * The schedule's setpoints, which would heat the hallway on their own whenever it fell below 20.2 °C.
     */
    environment.ecobee = createFakeEcobee({ coolCelsius: 23, heatCelsius: 20.2 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes hold with resting setpoints when the crib is in the middle of the range, so the schedule cannot heat', async () => {
    await startLoop();

    expect((await decide())?.outcome).toBe('took hold: resting');
    expect(lastSent()).toEqual({ coolCelsius: 21.6, heatCelsius: 18.8 });
  });

  it('does not take its own write for a person changing the setpoints', async () => {
    await startLoop();
    await decide();
    await decide(5);

    expect(environment.records.map((record) => record.outcome)).not.toContain('paused: changed by a person');
  });

  it('pauses when a person changes the setpoints', async () => {
    await startLoop();
    await decide();

    environment.ecobee?.setByHand({ coolCelsius: 24, heatCelsius: 21 });

    expect((await decide())?.outcome).toBe('paused: changed by a person');
    expect((await decide(3))?.outcome).toBe('paused: changed by a person');
  });

  it('starts heating near the low end, lets the run go on through the middle, and stops it near the top', async () => {
    await startLoop();
    await decide();

    environment.cribCelsius = 19.3;
    expect((await decide())?.outcome).toBe('started heating');
    expect(lastSent()).toEqual({ coolCelsius: 23.8, heatCelsius: 21 });

    const writesWhenStarted = thermostat.writeSetpoints.mock.calls.length;
    environment.cribCelsius = 20.2;
    await decide(3);
    expect(thermostat.writeSetpoints.mock.calls.length).toBe(writesWhenStarted);

    environment.cribCelsius = 20.7;
    expect((await decide(5))?.outcome).toBe('stopped heating');
    expect(lastSent()).toEqual({ coolCelsius: 21.6, heatCelsius: 18.8 });
  });

  it('does not start heating again before the rest is over while the crib is still in range', async () => {
    await startLoop();
    await decide();
    environment.cribCelsius = 19.3;
    await decide();
    environment.cribCelsius = 20.7;
    expect((await decide(8))?.outcome).toBe('stopped heating');

    environment.cribCelsius = 19.3;
    await decide(5);
    expect(environment.records.at(-1)?.outcome).toBe('resting');

    environment.cribCelsius = 18.8;
    expect((await decide())?.outcome).toBe('started heating');
  });

  it('moves the hold when the hallway warms toward the heat setpoint during a run, without stopping it', async () => {
    await startLoop();
    await decide();
    environment.cribCelsius = 19.3;
    await decide();

    environment.hallwayCelsius = 20.7;
    expect((await decide())?.outcome).toBe('moved the hold: heating');
    expect(lastSent().heatCelsius).toBe(21.5);
  });
});
