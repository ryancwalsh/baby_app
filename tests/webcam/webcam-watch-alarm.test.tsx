import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { unlockAlarm } from '@/components/webcam-alarm';
import { FakeAudioContext, FakeEventSource, mediaClock, stubNavigator } from '@/tests/webcam/fakes';
import { advance, useFakeBrowser } from '@/tests/webcam/setup';
import { CAMERA_ID, goLive, open, receiveOffer } from '@/tests/webcam/watch-helpers';

vi.mock('@/app/actions/webcam', () => ({
  sendWebcamSignalAction: vi.fn(async () => {}),
}));

const STALE_AFTER_MILLISECONDS = 5_000;
const MILLISECONDS_PER_MINUTE = 60_000;

function stubWakeLock(request: () => Promise<unknown>) {
  stubNavigator({ wakeLock: { request } });
}

describe('losing the camera', () => {
  useFakeBrowser();

  beforeEach(() => {
    unlockAlarm();
  });

  it('sounds the alarm when frames stop, though currentTime keeps advancing and the connection still says connected', async () => {
    const connection = await goLive();

    FakeAudioContext.oscillatorsStarted = 0;
    connection.isVideoFlowing = false;
    await advance(STALE_AFTER_MILLISECONDS + 2_000);

    expect(screen.getByText(/no picture/iu)).toBeTruthy();
    expect(screen.queryByText(/● Live/u)).toBeNull();
    expect(FakeAudioContext.oscillatorsStarted).toBeGreaterThan(0);
  });

  it('sounds the alarm when the sound stops, though the picture is still moving', async () => {
    const connection = await goLive();

    FakeAudioContext.oscillatorsStarted = 0;
    connection.isAudioFlowing = false;
    await advance(STALE_AFTER_MILLISECONDS + 2_000);

    expect(screen.getByText(/no sound/iu)).toBeTruthy();
    expect(FakeAudioContext.oscillatorsStarted).toBeGreaterThan(0);
  });

  it('does not sound the alarm while the picture is moving', async () => {
    await goLive();
    FakeAudioContext.oscillatorsStarted = 0;
    await advance(STALE_AFTER_MILLISECONDS * 4);

    expect(FakeAudioContext.oscillatorsStarted).toBe(0);
  });

  it('does not let a retry count as the picture moving', async () => {
    const connection = await goLive();

    connection.isAudioFlowing = false;
    connection.isVideoFlowing = false;
    /**
     * For a browser whose clock does stop. Attaching and detaching a stream still moved `currentTime`, which was enough to silence the alarm on every retry.
     */
    mediaClock.frozenAt = 12;
    await advance(STALE_AFTER_MILLISECONDS + 2_000);
    expect(screen.getByText(/no picture/iu)).toBeTruthy();

    act(() => {
      connection.setConnectionState('failed');
    });
    await receiveOffer('offer-2');
    await advance(2_000);
    FakeAudioContext.oscillatorsStarted = 0;
    await advance(3_000);

    expect(screen.getByText(/no picture/iu)).toBeTruthy();
    expect(FakeAudioContext.oscillatorsStarted).toBeGreaterThan(0);
  });

  it('stops alarming when a new connection brings frames back', async () => {
    const connection = await goLive();

    connection.isAudioFlowing = false;
    connection.isVideoFlowing = false;
    await advance(STALE_AFTER_MILLISECONDS + 2_000);

    const next = await receiveOffer('offer-2');

    act(() => {
      next.startFlowing();
    });
    await advance(2_000);
    FakeAudioContext.oscillatorsStarted = 0;
    await advance(3_000);

    expect(screen.queryByText(/no picture/iu)).toBeNull();
    expect(FakeAudioContext.oscillatorsStarted).toBe(0);
  });

  it('does not alarm when the camera was stopped on purpose', async () => {
    await goLive();
    act(() => {
      FakeEventSource.latest.emit({ signal: { from: CAMERA_ID, to: 'this-phone', type: 'bye' }, type: 'signal' });
    });
    FakeAudioContext.oscillatorsStarted = 0;
    await advance(STALE_AFTER_MILLISECONDS * 2);

    expect(screen.getByText(/camera was stopped/iu)).toBeTruthy();
    expect(FakeAudioContext.oscillatorsStarted).toBe(0);
  });

  it('says so when the alarm cannot make a sound', async () => {
    await goLive();
    FakeAudioContext.resumesTo = 'suspended';

    const [context] = FakeAudioContext.instances;

    if (context !== undefined) {
      context.state = 'suspended';
    }

    await advance(2_000);

    expect(screen.getByRole('button', { name: /alarm cannot sound/iu })).toBeTruthy();
  });

  it('lets someone hear the alarm before relying on it', async () => {
    await goLive();
    FakeAudioContext.oscillatorsStarted = 0;
    fireEvent.click(screen.getByRole('button', { name: /test alarm/iu }));

    expect(FakeAudioContext.oscillatorsStarted).toBeGreaterThan(0);
  });
});

describe('staying awake', () => {
  useFakeBrowser();

  it('keeps the screen on, because a locked phone cannot alarm', async () => {
    const request = vi.fn(async () => ({
      addEventListener: () => {
        // Never released here.
      },
      release: async () => {},
    }));

    stubWakeLock(request);
    await open();

    expect(request).toHaveBeenCalledWith('screen');
    expect(screen.queryByText(/screen may lock/iu)).toBeNull();
  });

  it('warns when the screen cannot be kept on', async () => {
    stubWakeLock(async () => {
      throw new Error('Refused.');
    });
    await open();

    expect(screen.getByText(/screen may lock/iu)).toBeTruthy();
  });

  it('owns up to the time it was not watching, once the page runs again', async () => {
    await goLive();

    /**
     * A locked iPhone freezes the page, so the watchdog simply does not run, and the first anyone knows of it is the clock having jumped.
     */
    vi.setSystemTime(Date.now() + 10 * MILLISECONDS_PER_MINUTE);
    await advance(1_000);

    expect(screen.getByText(/not monitored for 10m/iu)).toBeTruthy();
  });
});
