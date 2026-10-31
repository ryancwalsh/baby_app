'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';

import { deleteSleepAction, endSleepNowAction, getTrackingSummaryAction, startSleepNowAction, type TrackingSummary } from '@/app/actions/tracking';
import { BottleTile } from '@/components/bottle-tile';
import { DeleteSleepButton } from '@/components/delete-sleep-button';
import { MedicineTile } from '@/components/medicine-tile';
import { SleepPredictionTable } from '@/components/sleep-prediction-table';
import { predictNextSleeps } from '@/components/sleep-predictions';
import { StopwatchTile } from '@/components/stopwatch-tile';
import { TileNote } from '@/components/tile-note';
import { TILE_BUTTON_CLASS_NAME, TILE_COLORS } from '@/components/tile-styles';
import { formatAgo, formatDuration, formatRunningDuration } from '@/components/tracking-format';
import { useNow } from '@/hooks/use-now';
import { useTileTextSize } from '@/hooks/use-text-size';

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
        {latest !== undefined && <TileNote note={latest.note} />}
        <SleepPredictionTable now={now} predictions={predictions} />
        {active === undefined && latest === undefined && <span className="text-faint text-base">No sleeps yet.</span>}
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
      {error !== null && <p className="text-sm text-accent">{error}</p>}
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
        <span className="text-faint text-base">No diapers yet.</span>
      ) : (
        <>
          <span className="text-foreground/70 tabular-nums text-base">{formatAgo(now - new Date(diaper.changedAt).getTime())}</span>
          <TileNote note={diaper.note} />
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
      {error !== null && <p className="text-sm text-accent">{error}</p>}
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
          <BottleTile
            now={now}
            onChange={() => {
              load();
            }}
            secretHash={secretHash}
            summary={summary}
          />
          <DiaperTile now={now} summary={summary} />
          <MedicineTile medicine={summary.latestMedicine} now={now} />
          <StopwatchTile now={now} />
        </div>
      )}
    </div>
  );
}
