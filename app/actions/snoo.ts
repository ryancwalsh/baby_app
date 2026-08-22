'use server';

import { requireLogin } from '@/auth/login';
import { readSnoo, setSnooPower } from '@/services/snoo/connection';
import { type SnooState } from '@/services/snoo/state';

/**
 * The Snoo bassinet. These share one long-lived AWS IoT connection, so a press
 * is one publish on an open socket rather than a fresh sign-in and handshake —
 * see services/snoo/connection.ts.
 */

export async function getSnooAction(secretHash: string): Promise<SnooState> {
  await requireLogin(secretHash);

  return readSnoo();
}

export async function setSnooPowerAction(secretHash: string, isOn: boolean): Promise<SnooState> {
  await requireLogin(secretHash);

  return setSnooPower(isOn);
}
