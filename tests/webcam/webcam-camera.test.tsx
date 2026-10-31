import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendWebcamSignalAction } from '@/app/actions/webcam';
import { WebcamCamera } from '@/components/webcam-camera';
import { type WebcamSignal } from '@/services/webcam/messages';
import { FakeEventSource, FakePeerConnection, stubNavigator } from '@/tests/webcam/fakes';
import { advance, useFakeBrowser } from '@/tests/webcam/setup';

vi.mock('@/app/actions/webcam', () => ({
  sendWebcamSignalAction: vi.fn(async () => {}),
}));

const WATCHER_ID = 'watching-phone';

function getOffers(): WebcamSignal[] {
  return vi
    .mocked(sendWebcamSignalAction)
    .mock.calls.map(([, signal]) => signal)
    .filter((signal) => signal.type === 'offer');
}

async function startCamera() {
  const stream = { getTracks: () => [], getVideoTracks: () => [] };

  stubNavigator({ mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  render(
    <WebcamCamera
      onExit={() => {
        // Not under test.
      }}
      secretHash="hash"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /start camera/iu }));
  await advance(0);
}

async function receive(signal: WebcamSignal) {
  act(() => {
    FakeEventSource.latest.emit({ signal, type: 'signal' });
  });
  await advance(0);
}

describe('answers', () => {
  useFakeBrowser();

  beforeEach(() => {
    vi.mocked(sendWebcamSignalAction).mockClear();
  });

  it('survives a late answer to an offer it has since replaced', async () => {
    await startCamera();
    await receive({ from: WATCHER_ID, to: 'camera', type: 'hello' });
    await receive({ from: WATCHER_ID, to: 'camera', type: 'hello' });

    const [first, second] = getOffers();
    const connection = FakePeerConnection.latest;

    await receive({ description: { sdp: 'late', type: 'answer' }, from: WATCHER_ID, offerId: first?.offerId, to: 'camera', type: 'answer' });
    expect(connection.remoteDescription).toBeNull();

    await receive({ description: { sdp: 'current', type: 'answer' }, from: WATCHER_ID, offerId: second?.offerId, to: 'camera', type: 'answer' });
    expect(connection.remoteDescription?.sdp).toBe('current');
    expect(connection.isClosed).toBe(false);
  });

  it('gives each offer its own id', async () => {
    await startCamera();
    await receive({ from: WATCHER_ID, to: 'camera', type: 'hello' });
    await receive({ from: WATCHER_ID, to: 'camera', type: 'hello' });

    const [first, second] = getOffers();

    expect(first?.offerId).toBeTruthy();
    expect(second?.offerId).toBeTruthy();
    expect(first?.offerId).not.toBe(second?.offerId);
  });
});
