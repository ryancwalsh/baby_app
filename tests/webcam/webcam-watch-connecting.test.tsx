import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendWebcamSignalAction } from '@/app/actions/webcam';
import { stubNavigator } from '@/tests/webcam/fakes';
import { advance, useFakeBrowser } from '@/tests/webcam/setup';
import { getSentSignals, goLive, open, receiveOffer } from '@/tests/webcam/watch-helpers';

vi.mock('@/app/actions/webcam', () => ({
  sendWebcamSignalAction: vi.fn(async () => {}),
}));

describe('connecting', () => {
  useFakeBrowser();

  beforeEach(() => {
    vi.mocked(sendWebcamSignalAction).mockClear();
  });

  it('does not ask for a new offer while the current attempt is still connecting', async () => {
    await open();
    await receiveOffer();
    vi.mocked(sendWebcamSignalAction).mockClear();

    /**
     * A phone that takes more than 10 seconds to finish was never allowed to: every new offer closes the attempt in progress on both phones.
     */
    await advance(25_000);

    expect(getSentSignals('hello')).toEqual([]);
  });

  it('gives up on an attempt that never connects, and asks again', async () => {
    await open();
    await receiveOffer();
    vi.mocked(sendWebcamSignalAction).mockClear();

    await advance(35_000);

    expect(getSentSignals('hello').length).toBeGreaterThan(0);
  });

  it('asks again as soon as a live connection has failed', async () => {
    const connection = await goLive();

    vi.mocked(sendWebcamSignalAction).mockClear();
    act(() => {
      connection.isAudioFlowing = false;
      connection.isVideoFlowing = false;
      connection.setConnectionState('failed');
    });
    await advance(11_000);

    expect(getSentSignals('hello').length).toBeGreaterThan(0);
  });

  it('keeps saying it could not connect while it goes on trying', async () => {
    await open();

    const connection = await receiveOffer();

    act(() => {
      connection.setConnectionState('failed');
    });
    await advance(11_000);
    await receiveOffer('offer-2');

    expect(screen.getByText(/could not connect/iu)).toBeTruthy();
  });

  it('says it could not connect when an attempt runs out of time without failing', async () => {
    await open();
    await receiveOffer();
    await advance(35_000);

    expect(screen.getByText(/could not connect/iu)).toBeTruthy();
  });

  it('echoes the offer it is answering, so the camera can ignore a late answer', async () => {
    await open();
    await receiveOffer('offer-7');

    expect(getSentSignals('answer')[0]?.offerId).toBe('offer-7');
  });

  it('offers a direct connection after failing, which needs the microphone permission once', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));

    stubNavigator({ mediaDevices: { getUserMedia } });
    await open();

    const connection = await receiveOffer();

    act(() => {
      connection.setConnectionState('failed');
    });
    vi.mocked(sendWebcamSignalAction).mockClear();
    fireEvent.click(screen.getByRole('button', { name: /try a direct wifi connection/iu }));
    await advance(0);

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalled();
    expect(getSentSignals('hello').length).toBe(1);
  });

  it('shows what the connection is doing, for diagnosing one that fails on a real phone', async () => {
    await goLive();

    const diagnostics = screen.getByTestId('webcam-diagnostics').textContent;

    expect(diagnostics).toContain('connected');
    expect(diagnostics).toContain('mdns');
    expect(diagnostics).toContain('srflx');
    expect(diagnostics).toContain('VP8');
  });
});

describe('being live', () => {
  useFakeBrowser();

  it('does not claim to be live when connected with no frames arriving', async () => {
    await open();

    const connection = await receiveOffer();

    act(() => {
      connection.setConnectionState('connected');
    });
    await advance(2_000);

    expect(screen.queryByText(/● Live/u)).toBeNull();
  });

  it('claims to be live once frames are arriving', async () => {
    await goLive();

    expect(screen.getByText(/● Live/u)).toBeTruthy();
  });
});
