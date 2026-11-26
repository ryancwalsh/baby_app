import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { soundAlarm } from '@/components/webcam-alarm';
import { usePictureWatchdog } from '@/hooks/use-picture-watchdog';

vi.mock('@/components/webcam-alarm', () => ({
  soundAlarm: vi.fn(),
  unlockAlarm: vi.fn(),
}));

const ALARM_AFTER_MILLISECONDS = 30_000;
const MILLISECONDS_PER_HOUR = 3_600_000;

let visibilityState: DocumentVisibilityState = 'visible';

/**
 * Only what the watchdog reads: a clock that stands still unless the test moves it.
 */
function makeVideo() {
  return { currentTime: 0, paused: false, play: vi.fn(async () => {}) } as unknown as HTMLVideoElement;
}

function renderWatchdog(video: HTMLVideoElement) {
  return renderHook(() => usePictureWatchdog({ isStarting: false, isWatching: true, retry: () => {}, videoRef: { current: video } }));
}

const STEP_MILLISECONDS = 1_000;

/**
 * A second at a time, so that React runs the effects a tick sets off before the next tick, as a browser would.
 */
async function advance(milliseconds: number) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += STEP_MILLISECONDS) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(STEP_MILLISECONDS, milliseconds - elapsed));
    });
  }
}

describe('the Nanit picture watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    visibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilityState });
    vi.mocked(soundAlarm).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sounds the alarm once the picture has stood still for longer than the grace period', async () => {
    const { result } = renderWatchdog(makeVideo());

    await advance(ALARM_AFTER_MILLISECONDS + 10_000);

    expect(result.current.isStale).toBe(true);
    expect(soundAlarm).toHaveBeenCalled();
  });

  it('stops sounding once the page is hidden, where the phone pauses the picture itself', async () => {
    const { result } = renderWatchdog(makeVideo());

    await advance(ALARM_AFTER_MILLISECONDS + 10_000);
    visibilityState = 'hidden';
    await advance(2_000);
    vi.mocked(soundAlarm).mockClear();
    await advance(MILLISECONDS_PER_HOUR);

    expect(result.current.isStale).toBe(false);
    expect(soundAlarm).not.toHaveBeenCalled();
  });

  it('does not sound the moment a frozen page wakes up', async () => {
    const video = makeVideo();
    const { result } = renderWatchdog(video);

    await advance(3_000);
    video.currentTime = 3;
    await advance(1_000);

    /**
     * A locked iPhone freezes the page: the clock jumps an hour and no tick runs in between.
     */
    vi.setSystemTime(Date.now() + MILLISECONDS_PER_HOUR);
    await advance(3_000);

    expect(result.current.isStale).toBe(false);
    expect(soundAlarm).not.toHaveBeenCalled();
  });

  it('can be silenced for one loss of the picture without switching the alarm off', async () => {
    const video = makeVideo();
    const { result } = renderWatchdog(video);

    await advance(ALARM_AFTER_MILLISECONDS + 10_000);
    act(() => {
      result.current.silenceAlarm();
    });
    vi.mocked(soundAlarm).mockClear();
    await advance(20_000);

    expect(soundAlarm).not.toHaveBeenCalled();
    expect(result.current.isAlarmOn).toBe(true);

    video.currentTime = 1;
    await advance(1_000);

    expect(result.current.isStale).toBe(false);
    expect(result.current.isSilenced).toBe(false);
  });
});
