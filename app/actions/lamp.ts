"use server";

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

export interface Lamp {
  deviceId: string;
  alias: string;
  isOn: boolean;
}

export async function getLampsAction(): Promise<Lamp[]> {
  const devices = getConfiguredDevices();
  return Promise.all(
    devices.map(async ({ deviceId, alias }) => ({
      deviceId,
      alias,
      isOn: await readLampPower(deviceId),
    })),
  );
}

export async function setLampPowerAction(
  deviceId: string,
  isOn: boolean,
): Promise<boolean> {
  return setLampPower(deviceId, isOn);
}

export async function toggleLampAction(deviceId: string): Promise<boolean> {
  return toggleLampPower(deviceId);
}
