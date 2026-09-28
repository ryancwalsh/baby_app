'use server';

import { requireLogin } from '@/auth/login';
import { type WebcamCameraState, type WebcamSignal } from '@/services/webcam/messages';
import { getCameraState, relaySignal } from '@/services/webcam/signaling';

export async function getWebcamCameraStateAction(secretHash: string): Promise<WebcamCameraState> {
  await requireLogin(secretHash);

  return getCameraState();
}

export async function sendWebcamSignalAction(secretHash: string, signal: WebcamSignal): Promise<void> {
  await requireLogin(secretHash);
  relaySignal(signal);
}
