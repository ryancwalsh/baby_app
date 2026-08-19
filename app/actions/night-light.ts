"use server";

import {
  readNightLight,
  setNightLightBrightness,
  setNightLightPower,
  type NightLightState,
} from "@/lib/nanit/night-light";

/**
 * The Nanit camera's built-in night light. Each of these opens a fresh cloud
 * websocket, so expect several seconds per call, and expect `isOn` to be null
 * more often than not — see README.md for why it cannot be read back.
 */

export async function getNightLightAction(): Promise<NightLightState> {
  return readNightLight();
}

export async function setNightLightBrightnessAction(
  brightness: number,
): Promise<NightLightState> {
  return setNightLightBrightness(brightness);
}

export async function setNightLightPowerAction(
  isOn: boolean,
): Promise<NightLightState> {
  return setNightLightPower(isOn);
}
