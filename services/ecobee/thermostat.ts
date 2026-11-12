import { HttpClient } from 'hap-controller';

import { readStoredSecret } from '@/storage/stored-secrets';

/**
 * The hallway ecobee over HomeKit on the home network. See ecobee_plan.md. Reading is safe at any time. The two writes, `writeSetpoints` and `clearHold`, start or stop real heating or cooling, and only the worker's loop calls them.
 */

const STORED_SECRET_NAME = 'ecobee-homekit-pairing';

/**
 * Characteristic ids (`aid.iid`) on the thermostat's HomeKit thermostat service, as listed by `scripts/ecobee-describe.ts` on 2026-11-10.
 */
const CURRENT_ACTIVITY = '1.17';
const TARGET_MODE = '1.18';
const CURRENT_TEMPERATURE = '1.19';
const TARGET_TEMPERATURE = '1.20';
const COOLING_THRESHOLD = '1.22';
const HEATING_THRESHOLD = '1.23';
/**
 * Ecobee's own write-only characteristic that ends a hold and returns the thermostat to its schedule. Checked on 2026-11-12.
 */
const CLEAR_HOLD = '1.48';

const ACTIVITIES = ['idle', 'heating', 'cooling'] as const;
const MODES = ['off', 'heat', 'cool', 'auto'] as const;

export type ThermostatActivity = (typeof ACTIVITIES)[number];
export type ThermostatMode = (typeof MODES)[number];

/**
 * What the thermostat is aiming for, which depends on its mode: one setpoint in heat or cool, a range in auto, and nothing when off.
 */
export type ThermostatTarget = { celsius: number; mode: 'cool' | 'heat' } | { coolCelsius: number; heatCelsius: number; mode: 'auto' } | { mode: 'off' };

export type ThermostatState = {
  activity: ThermostatActivity;
  currentCelsius: number;
  target: ThermostatTarget;
};

type StoredPairing = {
  address: string;
  deviceId: string;
  pairing: ConstructorParameters<typeof HttpClient>[3];
  port: number;
};

async function getClient() {
  const stored = await readStoredSecret(STORED_SECRET_NAME);

  if (stored === null) {
    throw new Error('The thermostat is not paired. Run scripts/ecobee-pair.ts.');
  } else {
    const { address, deviceId, pairing, port } = JSON.parse(stored.value) as StoredPairing;

    return new HttpClient(deviceId, address, port, pairing);
  }
}

export async function readThermostat(): Promise<ThermostatState> {
  const client = await getClient();
  const { characteristics } = await client.getCharacteristics([CURRENT_ACTIVITY, TARGET_MODE, CURRENT_TEMPERATURE, TARGET_TEMPERATURE, COOLING_THRESHOLD, HEATING_THRESHOLD]);
  const values = new Map(characteristics.map((characteristic) => [`${characteristic.aid}.${characteristic.iid}`, Number(characteristic.value)]));
  const read = (id: string) => values.get(id) ?? Number.NaN;
  const mode = MODES[read(TARGET_MODE)] ?? 'off';
  let target: ThermostatTarget = { mode: 'off' };

  if (mode === 'auto') {
    target = { coolCelsius: read(COOLING_THRESHOLD), heatCelsius: read(HEATING_THRESHOLD), mode };
  } else if (mode === 'heat' || mode === 'cool') {
    target = { celsius: read(TARGET_TEMPERATURE), mode };
  }

  return { activity: ACTIVITIES[read(CURRENT_ACTIVITY)] ?? 'idle', currentCelsius: read(CURRENT_TEMPERATURE), target };
}

/**
 * Sends setpoints in °C for the given mode, which ecobee turns into a hold that ends by the Hold Action set in its app: both thresholds in auto, the one target in heat or cool. Never changes the mode.
 */
export async function writeSetpoints(mode: ThermostatMode, setpoints: { coolCelsius: null | number; heatCelsius: null | number }) {
  let characteristics: Record<string, number> = {};
  if (mode === 'auto' && setpoints.heatCelsius !== null && setpoints.coolCelsius !== null) {
    characteristics = { [COOLING_THRESHOLD]: setpoints.coolCelsius, [HEATING_THRESHOLD]: setpoints.heatCelsius };
  } else if (mode === 'heat' && setpoints.heatCelsius !== null) {
    characteristics = { [TARGET_TEMPERATURE]: setpoints.heatCelsius };
  } else if (mode === 'cool' && setpoints.coolCelsius !== null) {
    characteristics = { [TARGET_TEMPERATURE]: setpoints.coolCelsius };
  } else {
    throw new Error(`Nothing to send in ${mode} mode.`);
  }

  const client = await getClient();
  try {
    await client.setCharacteristics(characteristics);
  } finally {
    await client.close();
  }
}

/**
 * Ends any hold, so the thermostat goes back to its schedule.
 */
export async function clearHold() {
  const client = await getClient();
  try {
    await client.setCharacteristics({ [CLEAR_HOLD]: true });
  } finally {
    await client.close();
  }
}
