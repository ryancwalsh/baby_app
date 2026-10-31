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

export type ReceivedCounts = {
  audioPackets: number;
  /**
   * Empty until the first stats mention one.
   */
  codec: string;
  frames: number;
};

type InboundReport = { codecId?: string; framesDecoded?: number; kind?: string; mimeType?: string; packetsReceived?: number; type?: string };

/**
 * What has actually arrived on this connection, and the only evidence of a live camera worth trusting. Measured in Chrome: with frames stopped and even with the sender closed, `currentTime` on the video goes on advancing and `connectionState` goes on saying `connected` for several seconds, while these stop dead.
 */
export async function readReceivedCounts(connection: RTCPeerConnection): Promise<ReceivedCounts> {
  const stats = await connection.getStats();
  const counts: ReceivedCounts = { audioPackets: 0, codec: '', frames: 0 };

  for (const report of stats.values() as Iterable<InboundReport>) {
    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      const codec = report.codecId === undefined ? undefined : (stats.get(report.codecId) as InboundReport | undefined);

      counts.frames = report.framesDecoded ?? 0;
      counts.codec = codec?.mimeType?.replace('video/', '') ?? '';
    } else if (report.type === 'inbound-rtp' && report.kind === 'audio') {
      counts.audioPackets = report.packetsReceived ?? 0;
    }
  }

  return counts;
}

/**
 * Which kinds of candidate a description offers. `mdns` is a host candidate hidden behind a `.local` name, which is what Chrome sends until the page has microphone or camera permission.
 */
function summarizeCandidates(sdp: string | undefined): string {
  const kinds = new Set<string>();

  for (const line of (sdp ?? '').split(/\r?\n/u)) {
    if (line.startsWith('a=candidate:')) {
      const [, , , , address, , , kind] = line.split(' ');

      kinds.add(kind === 'host' && address?.endsWith('.local') === true ? 'mdns' : (kind ?? 'unknown'));
    }
  }

  return kinds.size === 0 ? 'none' : [...kinds].join(', ');
}

/**
 * One line saying what a connection is doing, shown on the watch screen because a failure on a real phone cannot be looked into any other way.
 */
export function describeConnection(connection: null | RTCPeerConnection, received: ReceivedCounts): string {
  return connection === null
    ? 'No connection yet'
    : [
        connection.connectionState,
        `ICE ${connection.iceConnectionState}`,
        `local ${summarizeCandidates(connection.localDescription?.sdp)}`,
        `remote ${summarizeCandidates(connection.remoteDescription?.sdp)}`,
        received.codec === '' ? 'no codec' : received.codec,
        `${received.frames} frames`,
      ].join(' · ');
}
