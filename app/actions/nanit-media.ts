'use server';

import { requireLogin } from '@/auth/login';
import { type MediaKind, stopMedia } from '@/services/nanit/media';

/**
 * Starting is not an action: a phone starts listening or watching simply by
 * playing the playlist, and the request itself starts the relay.
 *
 * Stopping is, because the relay would otherwise keep the camera streaming
 * until the idle timeout noticed — half a minute of the nursery being pushed to
 * the cloud for nobody.
 */
export async function stopNanitMediaAction(secretHash: string, kind: MediaKind): Promise<void> {
  await requireLogin(secretHash);
  await stopMedia(kind);
}
