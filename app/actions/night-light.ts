'use server';

import { requireLogin } from '@/auth/login';
import { type NightLightState, readNightLight, setNightLightBrightness, setNightLightPower } from '@/services/nanit/night-light';

/**
 * The Nanit camera's built-in night light. These share one long-lived camera
 * connection, so a press is a single frame on an open socket rather than a
 * fresh login and handshake — see services/nanit/connection.ts.
 */

export async function getNightLightAction(secretHash: string): Promise<NightLightState> {
  await requireLogin(secretHash);
  return readNightLight();
}

export async function setNightLightBrightnessAction(secretHash: string, brightness: number): Promise<NightLightState> {
  await requireLogin(secretHash);
  return setNightLightBrightness(brightness);
}

export async function setNightLightPowerAction(secretHash: string, isOn: boolean): Promise<NightLightState> {
  await requireLogin(secretHash);
  return setNightLightPower(isOn);
}
