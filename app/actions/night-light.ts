"use server";

import { requireLogin } from "@/lib/login";
import {
  readNightLight,
  setNightLightBrightness,
  setNightLightPower,
  type NightLightState,
} from "@/lib/nanit/night-light";

/**
 * The Nanit camera's built-in night light. These share one long-lived camera
 * connection, so a press is a single frame on an open socket rather than a
 * fresh login and handshake — see lib/nanit/connection.ts.
 */

export async function getNightLightAction(
  secretHash: string,
): Promise<NightLightState> {
  requireLogin(secretHash);
  return readNightLight();
}

export async function setNightLightBrightnessAction(
  secretHash: string,
  brightness: number,
): Promise<NightLightState> {
  requireLogin(secretHash);
  return setNightLightBrightness(brightness);
}

export async function setNightLightPowerAction(
  secretHash: string,
  isOn: boolean,
): Promise<NightLightState> {
  requireLogin(secretHash);
  return setNightLightPower(isOn);
}
