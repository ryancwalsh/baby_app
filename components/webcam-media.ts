'use client';

import { type FacingMode } from '@/components/webcam-checklist';

/**
 * The camera and speaker handling behind webcam mode, apart from the screens.
 */

/**
 * Modest on purpose. A phone doing this all night is plugged in and still gets
 * warm, and 720p at 15 frames a second is plenty to see a cot by.
 */
export function getCameraConstraints(facingMode: FacingMode): MediaStreamConstraints {
  return {
    /**
     * Noise suppression is off because the noises it would suppress are the
     * ones worth hearing, and echo cancellation is off because this phone never
     * plays sound. Gain control stays on, so a quiet room is still audible.
     */
    audio: { autoGainControl: true, echoCancellation: false, noiseSuppression: false },
    video: { facingMode, frameRate: { ideal: 15 }, height: { ideal: 720 }, width: { ideal: 1_280 } },
  };
}

/**
 * Swaps the picture to the other camera without dropping anyone watching: the
 * new track replaces the old one on every connection, so no new offer is
 * needed.
 *
 * The old camera is stopped before the new one is asked for, because iOS will
 * not hand out a second camera while the first is still open.
 */
export async function switchCamera(stream: MediaStream, connections: RTCPeerConnection[], facingMode: FacingMode): Promise<void> {
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }

  const [videoTrack] = (await window.navigator.mediaDevices.getUserMedia({ video: getCameraConstraints(facingMode).video })).getVideoTracks();

  if (videoTrack !== undefined) {
    stream.addTrack(videoTrack);

    for (const connection of connections) {
      for (const sender of connection.getSenders()) {
        if (sender.track === null || sender.track.kind === 'video') {
          await sender.replaceTrack(videoTrack);
        }
      }
    }
  }
}

/**
 * Plays with sound if the browser allows it, and muted if not. Returns whether
 * the sound is on.
 *
 * Sound needs a tap the browser will count, and an offer arriving is not one.
 * The picture can play muted meanwhile, and the caller offers a button for the
 * sound.
 */
export async function playWithSound(video: HTMLVideoElement): Promise<boolean> {
  let isSoundOn = false;

  try {
    video.muted = false;
    await video.play();
    isSoundOn = true;
  } catch {
    // eslint-disable-next-line require-atomic-updates -- The element is live, not a copy; muting it after a refusal is the intent.
    video.muted = true;

    try {
      await video.play();
    } catch {
      /**
       * The same tap starts both.
       */
    }
  }

  return isSoundOn;
}
