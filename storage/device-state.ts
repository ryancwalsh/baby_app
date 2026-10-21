import { query } from '@/storage/database';

/**
 * The Nanit's last known night light and temperature, written by the worker as they change, so that pages can show something honest when the laptop is off. Always last known, never verified, and stored with the time it was written.
 */

export type DeviceStateName = 'night-light' | 'temperature';

async function writeDeviceState(name: DeviceStateName, value: unknown) {
  try {
    await query('INSERT INTO device_state (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', [
      name,
      JSON.stringify(value),
      new Date().toISOString(),
    ]);
  } catch (error) {
    console.error(`Could not record the ${name} state.`, error);
  }
}

/**
 * Not awaited and never thrown: the camera's state matters more than a record of it, and a database that cannot be reached must not hold up a press.
 */
export function recordDeviceState(name: DeviceStateName, value: unknown) {
  writeDeviceState(name, value);
}
