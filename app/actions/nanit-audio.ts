'use server';

import { requireLogin } from '@/auth/login';
import { stopAudio } from '@/services/nanit/audio';

/**
 * Starting is not an action: a phone starts listening simply by playing
 * `/api/nanit/audio/audio.m3u8`, and the request itself starts the relay.
 *
 * Stopping is, because the relay would otherwise keep the camera streaming
 * until the idle timeout noticed — half a minute of the nursery being pushed to
 * the cloud for nobody.
 */
export async function stopNanitAudioAction(secretHash: string): Promise<void> {
  await requireLogin(secretHash);
  await stopAudio();
}
