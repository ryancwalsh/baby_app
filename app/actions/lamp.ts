"use server";

import { requireLogin } from "@/lib/login";
import {
  getConfiguredDevices,
  readLampPower,
  setLampPower,
  toggleLampPower,
} from "@/lib/tapo/client";

/**
 * The smart plugs the lamps are on. Unlike the night light, their state can be
 * read back, so these return the power state each plug actually reports.
 */

export interface ConnectedLamp {
  deviceId: string;
  alias: string;
  isReachable: true;
  /**
   * Never unknown: a plug that answers always reports its relay state. Only
   * reaching the plug can fail, which is the case below.
   */
  isOn: boolean;
}

export interface UnreachableLamp {
  deviceId: string;
  alias: string;
  isReachable: false;
  reason: string;
}

export type Lamp = ConnectedLamp | UnreachableLamp;

/**
 * One unreachable plug must not take the page down with the rest, so each read
 * is caught on its own.
 */
export async function getLampsAction(secretHash: string): Promise<Lamp[]> {
  requireLogin(secretHash);
  const devices = getConfiguredDevices();

  return Promise.all(
    devices.map(async ({ deviceId, alias }): Promise<Lamp> => {
      try {
        return {
          deviceId,
          alias,
          isReachable: true,
          isOn: await readLampPower(deviceId),
        };
      } catch (error) {
        return {
          deviceId,
          alias,
          isReachable: false,
          reason: error instanceof Error ? error.message : "Unreachable",
        };
      }
    }),
  );
}

export async function setLampPowerAction(
  secretHash: string,
  deviceId: string,
  isOn: boolean,
): Promise<boolean> {
  requireLogin(secretHash);
  return setLampPower(deviceId, isOn);
}

export async function toggleLampAction(
  secretHash: string,
  deviceId: string,
): Promise<boolean> {
  requireLogin(secretHash);
  return toggleLampPower(deviceId);
}
