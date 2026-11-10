import { HttpClient } from 'hap-controller';

import { readStoredSecret } from '@/storage/stored-secrets';

/**
 * The hallway ecobee, read over HomeKit on the home network. See ecobee_plan.md. This only reads: nothing here writes to the thermostat.
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
