'use client';

import { type WebcamRole, type WebcamServerMessage } from '@/services/webcam/messages';

/**
 * Public STUN servers only, and no TURN relay. Two phones behind ordinary home
 * or phone-carrier networks usually find each other this way; ones on a hotel
 * or guest network that keeps its devices apart will not, and that is accepted
 * rather than paid for.
 */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

/**
 * How long to wait for network candidates before sending a description with
 * whatever has been found. Gathering against STUN is usually done well within
 * this, but a phone with an interface that never answers can hold it open.
 */
const ICE_GATHERING_TIMEOUT_MILLISECONDS = 3_000;

export function openWebcamStream(secretHash: string, role: WebcamRole, clientId: string, onMessage: (message: WebcamServerMessage) => void): EventSource {
  const parameters = new URLSearchParams({ clientId, role, secretHash });
  const source = new EventSource(`/api/webcam/stream?${parameters.toString()}`);

  source.addEventListener('message', (event) => {
    onMessage(JSON.parse(event.data) as WebcamServerMessage);
  });

  return source;
}

/**
 * Candidates are sent inside the description rather than one at a time, so the
 * whole exchange is one offer and one answer. That costs up to a few seconds of
 * waiting here and saves a great deal of ordering trouble.
 */
export async function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState !== 'complete') {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(finish, ICE_GATHERING_TIMEOUT_MILLISECONDS);

      function handleChange() {
        if (connection.iceGatheringState === 'complete') {
          finish();
        }
      }

      function finish() {
        clearTimeout(timeout);
        connection.removeEventListener('icegatheringstatechange', handleChange);
        resolve();
      }

      connection.addEventListener('icegatheringstatechange', handleChange);
    });
  }
}

/**
 * A description with no candidates in it is useless to the other phone, so
 * this is what gets sent: the local description once gathering has finished.
 */
export function getLocalDescription(connection: RTCPeerConnection): RTCSessionDescriptionInit {
  const description = connection.localDescription;

  if (description === null) {
    throw new Error('No local description to send.');
  }

  return { sdp: description.sdp, type: description.type };
}
