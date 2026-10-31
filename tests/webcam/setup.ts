import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { FakeAudioContext, FakeEventSource, FakePeerConnection, FakeResizeObserver, installFakeMediaElement, mediaClock, restoreNavigator } from '@/tests/webcam/fakes';

/**
 * Each of these fires a watchdog or a timeout while awaiting whatever it started, so a test sees the state the page would be in by then.
 */
export async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

export function useFakeBrowser() {
  beforeEach(() => {
    vi.useFakeTimers();
    FakePeerConnection.instances = [];
    FakeEventSource.instances = [];
    FakeAudioContext.instances = [];
    FakeAudioContext.reset();
    mediaClock.frozenAt = null;
    mediaClock.startedAt = null;
    window.localStorage.clear();
    installFakeMediaElement();
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    restoreNavigator();
  });
}
