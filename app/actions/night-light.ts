'use server';

import { requireLogin } from '@/auth/login';
import { type NightLightState, readNightLight, setNightLightBrightness, setNightLightPower, startNightLightFade, stopNightLightFade } from '@/services/nanit/night-light';

/**
 * The Nanit camera's built-in night light. These share one long-lived camera
 * connection, so a press is a single frame on an open socket rather than a
 * fresh login and handshake — see services/nanit/connection.ts.
 */

export async function getNightLightAction(secretHash: string): Promise<NightLightState> {
  await requireLogin(secretHash);
  return readNightLight();
}

/**
 * Any hand-set brightness wins over a fade that is still running. The fade
 * writes through `setNightLightBrightness` itself, which is why the cancel is
 * here rather than down there.
 */
export async function setNightLightBrightnessAction(secretHash: string, brightness: number): Promise<NightLightState> {
  await requireLogin(secretHash);
  stopNightLightFade();

  return setNightLightBrightness(brightness);
}

export async function startNightLightFadeAction(secretHash: string): Promise<NightLightState> {
  await requireLogin(secretHash);

  return startNightLightFade();
}

export async function stopNightLightFadeAction(secretHash: string): Promise<NightLightState> {
  await requireLogin(secretHash);

  return stopNightLightFade();
}

export async function setNightLightPowerAction(secretHash: string, isOn: boolean): Promise<NightLightState> {
  await requireLogin(secretHash);
  return setNightLightPower(isOn);
}
