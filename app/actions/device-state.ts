'use server';

import { requireLogin } from '@/auth/login';
import { query } from '@/storage/database';

export type LastKnownNanit = {
  nightLight: null | { brightness: number; isOn: boolean; updatedAt: string };
  temperature: null | { celsius: number; measuredAt: string };
};

/**
 * What the worker last recorded of the Nanit, for pages to show while the laptop cannot be reached. Last known, never verified, and always shown with its time.
 */
export async function getLastKnownNanitAction(secretHash: string): Promise<LastKnownNanit> {
  await requireLogin(secretHash);

  const rows = (await query('SELECT name, value, updated_at FROM device_state')).rows;
  const lastKnown: LastKnownNanit = { nightLight: null, temperature: null };

  for (const row of rows) {
    if (row.name === 'night-light') {
      lastKnown.nightLight = { ...(JSON.parse(String(row.value)) as { brightness: number; isOn: boolean }), updatedAt: String(row.updated_at) };
    } else if (row.name === 'temperature') {
      lastKnown.temperature = JSON.parse(String(row.value)) as { celsius: number; measuredAt: string };
    }
  }

  return lastKnown;
}
