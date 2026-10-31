import { act, render } from '@testing-library/react';
import { vi } from 'vitest';

import { sendWebcamSignalAction } from '@/app/actions/webcam';
import { WebcamWatch } from '@/components/webcam-watch';
import { type WebcamSignal } from '@/services/webcam/messages';
import { FakeEventSource, FakePeerConnection } from '@/tests/webcam/fakes';
import { advance } from '@/tests/webcam/setup';

export const CAMERA_ID = 'camera-phone';

export function getSentSignals(type: WebcamSignal['type']): WebcamSignal[] {
  return vi
    .mocked(sendWebcamSignalAction)
    .mock.calls.map(([, signal]) => signal)
    .filter((signal) => signal.type === type);
}

export async function open() {
  render(
    <WebcamWatch
      onExit={() => {
        // Not under test.
      }}
      secretHash="hash"
    />,
  );
  await advance(0);
  act(() => {
    FakeEventSource.latest.emit({ startedAt: 1, type: 'camera' });
  });
}

/**
 * The camera's offer arriving, and this phone answering it.
 */
export async function receiveOffer(offerId = 'offer-1'): Promise<FakePeerConnection> {
  act(() => {
    FakeEventSource.latest.emit({
      signal: { description: { sdp: 'offer', type: 'offer' }, from: CAMERA_ID, offerId, to: 'this-phone', type: 'offer' },
      type: 'signal',
    });
  });
  await advance(0);

  const connection = FakePeerConnection.latest;

  act(() => {
    connection.deliverTrack();
    connection.setConnectionState('connecting');
  });

  return connection;
}

export async function goLive(): Promise<FakePeerConnection> {
  await open();

  const connection = await receiveOffer();

  act(() => {
    connection.startFlowing();
  });
  await advance(2_000);

  return connection;
}
