'use server';

import { requireLogin } from '@/auth/login';
import { getConfiguredDevices, readLampPower, setLampPower, toggleLampPower } from '@/services/tapo/client';

/**
 * The smart plugs the lamps are on. Unlike the night light, their state can be
 * read back, so these return the power state each plug actually reports.
 */

export type ConnectedLamp = {
  alias: string;
  deviceId: string;
  /**
   * The icon named in `TAPO_DEVICES`, or undefined for a device that named
   * none. Sent to the browser because the row draws it.
   */
  iconName: string | undefined;
  /**
   * Never unknown: a plug that answers always reports its relay state. Only
   * reaching the plug can fail, which is the case below.
   */
  isOn: boolean;
  isReachable: true;
};

export type UnreachableLamp = {
  alias: string;
  deviceId: string;
  isReachable: false;
  reason: string;
};

export type Lamp = ConnectedLamp | UnreachableLamp;

/**
 * One unreachable plug must not take the page down with the rest, so each read
 * is caught on its own.
 */
export async function getLampsAction(secretHash: string): Promise<Lamp[]> {
  await requireLogin(secretHash);
  const devices = getConfiguredDevices();

  return Promise.all(
    devices.map(async ({ alias, deviceId, iconName }): Promise<Lamp> => {
      try {
        return {
          alias,
          deviceId,
          iconName,
          isOn: await readLampPower(deviceId),
          isReachable: true,
        };
      } catch (error) {
        return {
          alias,
          deviceId,
          isReachable: false,
          reason: error instanceof Error ? error.message : 'Unreachable',
        };
      }
    }),
  );
}

export async function setLampPowerAction(secretHash: string, deviceId: string, isOn: boolean): Promise<boolean> {
  await requireLogin(secretHash);
  return setLampPower(deviceId, isOn);
}

export async function toggleLampAction(secretHash: string, deviceId: string): Promise<boolean> {
  await requireLogin(secretHash);
  return toggleLampPower(deviceId);
}
