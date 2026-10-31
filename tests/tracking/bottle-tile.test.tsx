import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getBottleAction, getTrackingSummaryAction, resumeBottleNowAction, saveBottleAction } from '@/app/actions/tracking';
import { BottleForm } from '@/components/bottle-form';
import { TrackTiles } from '@/components/track-tiles';
import { type Bottle } from '@/storage/tracking-types';

vi.mock('@/app/actions/tracking', () => ({
  deleteBottleAction: vi.fn(async () => ({ error: null })),
  getBottleAction: vi.fn(),
  getTrackingSummaryAction: vi.fn(),
  resumeBottleNowAction: vi.fn(async () => ({ error: null })),
  saveBottleAction: vi.fn(async () => ({ error: null })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const MILLISECONDS_PER_MINUTE = 60_000;

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * MILLISECONDS_PER_MINUTE).toISOString();
}

function makeBottle(overrides: Partial<Bottle>): Bottle {
  return {
    amountMilliliters: 90,
    drankMilliliters: null,
    id: 7,
    note: '',
    preparedAt: minutesAgo(120),
    resumedAt: null,
    touchedLipsAt: null,
    ...overrides,
  };
}

async function renderTile(bottle: Bottle) {
  vi.mocked(getTrackingSummaryAction).mockResolvedValue({
    latestBottle: bottle,
    latestDiaper: null,
    latestMedicine: null,
    recentSleeps: [],
    settings: {
      birthDate: null,
      dayEndsAt: '18:00',
      dayStartsAt: '06:30',
      dayTotalsFrom: 'midnight',
      predictionMethod: 'fixed',
      threeNapWakeWindowMinutes: [],
      twoNapWakeWindowMinutes: [],
    },
  });
  render(<TrackTiles secretHash="hash" />);
  await screen.findByText('Bottle');
}

describe('the bottle tile', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(resumeBottleNowAction).mockClear();
    vi.mocked(getTrackingSummaryAction).mockReset();
  });

  afterEach(cleanup);

  it('has no Resume button until touched lips is older than the default 30 minutes', async () => {
    await renderTile(makeBottle({ touchedLipsAt: minutesAgo(29) }));

    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
  });

  it('has no Resume button without a touched lips time', async () => {
    await renderTile(makeBottle({ touchedLipsAt: null }));

    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
  });

  it('has a Resume button past the delay, which saves at once and reads the log again', async () => {
    await renderTile(makeBottle({ touchedLipsAt: minutesAgo(31) }));

    const callsBefore = vi.mocked(getTrackingSummaryAction).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await vi.waitFor(() => {
      expect(resumeBottleNowAction).toHaveBeenCalledWith('hash', 7);
      expect(vi.mocked(getTrackingSummaryAction).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('honours the delay chosen on this phone', async () => {
    window.localStorage.setItem('baby-app-bottle-resume-delay-minutes', '10');
    await renderTile(makeBottle({ touchedLipsAt: minutesAgo(11) }));

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('keeps the Resume button after resuming, since another press overwrites', async () => {
    await renderTile(makeBottle({ resumedAt: minutesAgo(1), touchedLipsAt: minutesAgo(31) }));

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('shows how long ago the newest bottle was resumed', async () => {
    await renderTile(makeBottle({ resumedAt: minutesAgo(5), touchedLipsAt: minutesAgo(31) }));

    expect(screen.getByText(/Resumed 5m ago/u)).toBeTruthy();
  });
});

describe('the bottle form', () => {
  afterEach(cleanup);

  it('has no Resumed field on a new bottle', () => {
    render(<BottleForm id={null} secretHash="hash" />);

    expect(screen.queryByText('Resumed')).toBeNull();
  });

  it('has no Resumed field on a saved bottle without touched lips', async () => {
    vi.mocked(getBottleAction).mockResolvedValue(makeBottle({ touchedLipsAt: null }));
    render(<BottleForm id={7} secretHash="hash" />);
    await screen.findByText('Touched lips');

    expect(screen.queryByText('Resumed')).toBeNull();
  });

  it('has a Resumed field on a saved bottle with touched lips, and saves it', async () => {
    const resumedAt = minutesAgo(5);

    vi.mocked(getBottleAction).mockResolvedValue(makeBottle({ resumedAt, touchedLipsAt: minutesAgo(31) }));
    render(<BottleForm id={7} secretHash="hash" />);
    await screen.findByText('Resumed');
    fireEvent.submit(screen.getByRole('button', { name: /save/iu }));

    await vi.waitFor(() => {
      const [, , input] = vi.mocked(saveBottleAction).mock.calls.at(-1) ?? [];

      expect(input?.resumedAt).toBeTruthy();
    });
  });
});
