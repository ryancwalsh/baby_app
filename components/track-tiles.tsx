'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';

import { deleteSleepAction, endSleepNowAction, getTrackingSummaryAction, startSleepNowAction, type TrackingSummary } from '@/app/actions/tracking';
import { DeleteSleepButton } from '@/components/delete-sleep-button';
import { NextBottle } from '@/components/next-bottle';
import { SleepPredictionTable } from '@/components/sleep-prediction-table';
import { predictNextSleeps } from '@/components/sleep-predictions';
import { StopwatchTile } from '@/components/stopwatch-tile';
import { TILE_BUTTON_CLASS_NAME, TILE_COLORS } from '@/components/tile-styles';
import { formatAgo, formatDuration, formatRunningDuration } from '@/components/tracking-format';
import { MILLISECONDS_PER_MINUTE } from '@/constants/time';
import { useBottleInterval } from '@/hooks/use-bottle-interval';
import { getBottleTime, useBottleTime } from '@/hooks/use-bottle-time';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useNow } from '@/hooks/use-now';
import { useTileTextSize } from '@/hooks/use-text-size';

function Note({ note }: { readonly note: string }) {
  return note === '' ? null : <p className="text-foreground/50 truncate italic text-base">{note}</p>;
}

function SleepTile({
  now,
  onChange,
  secretHash,
  summary,
}: {
  readonly now: number;
  readonly onChange: () => void;
  readonly secretHash: string;
  readonly summary: TrackingSummary;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<null | string>(null);
  const active = summary.recentSleeps.find((sleep) => sleep.endedAt === null);
  const latest = summary.recentSleeps.find((sleep) => sleep.endedAt !== null);
  const [mostRecent] = summary.recentSleeps;
  const predictions = predictNextSleeps(summary.recentSleeps, summary.settings, now);
  const colors = TILE_COLORS.sleep;

  function run(action: (hash: string) => Promise<{ error: null | string }>) {
    startTransition(async () => {
      const result = await action(secretHash);
      setError(result.error);
      onChange();
    });
  }

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 ${colors.border} ${colors.surface}`}>
      <Link className="flex flex-col gap-1" href="/track/sleep">
        <span className={`text-lg font-semibold ${colors.label}`}>Sleep</span>
        {active !== undefined && <span className="text-2xl tabular-nums">Sleeping {formatRunningDuration(now - new Date(active.startedAt).getTime())}</span>}
        {latest !== undefined && latest.endedAt !== null && (
          <span className="text-foreground/70 tabular-nums text-base">
            Woke {formatAgo(now - new Date(latest.endedAt).getTime())} from {formatDuration(new Date(latest.endedAt).getTime() - new Date(latest.startedAt).getTime())} sleep
          </span>
        )}
        {latest !== undefined && <Note note={latest.note} />}
        <SleepPredictionTable now={now} predictions={predictions} />
        {active === undefined && latest === undefined && <span className="text-foreground/50 text-base">No sleeps yet.</span>}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`}
          disabled={isPending}
          onClick={() => {
            run(active === undefined ? startSleepNowAction : endSleepNowAction);
          }}
          type="button"
        >
          {active === undefined ? 'Start sleep now' : 'Woke up'}
        </button>
        {mostRecent !== undefined && (
          <Link className={`${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`} href={`/track/sleep?id=${mostRecent.id}&from=track`}>
            Edit
          </Link>
        )}
        {active !== undefined && active.note === '' && (
          <DeleteSleepButton
            onDelete={() => {
              run(async (hash) => deleteSleepAction(hash, active.id));
            }}
          />
        )}
      </div>
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
    </div>
  );
}

/**
 * The whole tile adds a bottle, through a link stretched underneath everything else; the content lets taps fall through to it. Edit is the one thing on top that catches its own taps. New does nothing of its own — it is there to say what tapping the tile does.
 */
function BottleTile({ now, summary }: { readonly now: number; readonly summary: TrackingSummary }) {
  const { is24Hour } = useClockFormat();
  const { bottleTimeBasis } = useBottleTime();
  const { bottleIntervalMinutes } = useBottleInterval();
  const bottle = summary.latestBottle;
  const colors = TILE_COLORS.bottle;
  const amounts =
    bottle === null
      ? []
      : [bottle.amountMilliliters === null ? '' : `${bottle.amountMilliliters} ml`, bottle.drankMilliliters === null ? '' : `drank ${bottle.drankMilliliters} ml`].filter(
          (amount) => amount !== '',
        );
  const nextBottleTime = bottle === null ? null : getBottleTime(bottle, bottleTimeBasis) + bottleIntervalMinutes * MILLISECONDS_PER_MINUTE;

  return (
    <div className={`relative flex flex-col gap-3 rounded-2xl border p-4 ${colors.border} ${colors.surface}`}>
      <Link aria-label="New bottle" className="absolute inset-0 rounded-2xl" href="/track/bottle" />
      <div className="pointer-events-none relative flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-lg font-semibold ${colors.label}`}>Bottle</span>
          {nextBottleTime !== null && <NextBottle is24Hour={is24Hour} nextBottleTime={nextBottleTime} now={now} />}
        </div>
        {bottle === null ? (
          <span className="text-foreground/50 text-base">No bottles yet.</span>
        ) : (
          <>
            <span className="text-foreground/70 tabular-nums text-base">Prepared {formatAgo(now - new Date(bottle.preparedAt).getTime())}</span>
            {bottle.touchedLipsAt !== null && (
              <span className="text-foreground/70 tabular-nums text-base">Touched lips {formatAgo(now - new Date(bottle.touchedLipsAt).getTime())}</span>
            )}
            {amounts.length > 0 && <span className="text-foreground/70 text-base">{amounts.join(', ')}</span>}
            <Note note={bottle.note} />
          </>
        )}
      </div>
      <div className="pointer-events-none relative flex gap-2">
        <span className={`${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`}>New</span>
        {bottle !== null && (
          <Link className={`pointer-events-auto ${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`} href={`/track/bottle?id=${bottle.id}&from=track`}>
            Edit
          </Link>
        )}
      </div>
    </div>
  );
}

function DiaperTile({ now, summary }: { readonly now: number; readonly summary: TrackingSummary }) {
  const diaper = summary.latestDiaper;
  const colors = TILE_COLORS.diaper;

  return (
    <Link className={`flex flex-col gap-1 rounded-2xl border p-4 ${colors.border} ${colors.surface}`} href="/track/diaper">
      <span className={`text-lg font-semibold ${colors.label}`}>Diaper</span>
      {diaper === null ? (
        <span className="text-foreground/50 text-base">No diapers yet.</span>
      ) : (
        <>
          <span className="text-foreground/70 tabular-nums text-base">{formatAgo(now - new Date(diaper.changedAt).getTime())}</span>
          <Note note={diaper.note} />
        </>
      )}
    </Link>
  );
}

/**
 * Read again whenever the page comes back into view, so an entry made on the other phone shows up without a reload.
 */
export function TrackTiles({ secretHash }: { readonly secretHash: string }) {
  const [summary, setSummary] = useState<null | TrackingSummary>(null);
  const [error, setError] = useState<null | string>(null);
  const now = useNow();
  const { zoom } = useTileTextSize();

  const load = useCallback(async () => {
    try {
      setSummary(await getTrackingSummaryAction(secretHash));
      setError(null);
    } catch {
      setError('Could not load the tracking log.');
    }
  }, [secretHash]);

  useEffect(() => {
    /**
     * State is only set once the server has answered — this is fetching on mount, not a synchronous cascade.
     */
    load();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        load();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-2">
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      {summary !== null && now !== null && (
        <div className="flex flex-col gap-2" style={{ zoom }}>
          <SleepTile
            now={now}
            onChange={() => {
              load();
            }}
            secretHash={secretHash}
            summary={summary}
          />
          <BottleTile now={now} summary={summary} />
          <DiaperTile now={now} summary={summary} />
          <StopwatchTile now={now} />
        </div>
      )}
    </div>
  );
}
