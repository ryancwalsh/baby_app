'use client';

import { SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';

import { endSleepNowAction, getTrackingSummaryAction, startSleepNowAction, type TrackingSummary } from '@/app/actions/tracking';
import { predictNextSleeps } from '@/components/sleep-predictions';
import { formatAgo, formatClockTime, formatDuration, formatRunningDuration } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useNow } from '@/hooks/use-now';
import { useTileTextSize } from '@/hooks/use-tile-text-size';

/**
 * Dark tiles tinted with each colour rather than filled with it, so the screen stays dim in the nursery at night.
 */
export const TILE_COLORS = {
  bottle: { border: 'border-orange-500/30', label: 'text-orange-500', surface: 'bg-orange-500/10' },
  diaper: { border: 'border-yellow-500/30', label: 'text-yellow-600 dark:text-yellow-400', surface: 'bg-yellow-500/10' },
  sleep: { border: 'border-sky-400/30', label: 'text-sky-500 dark:text-sky-400', surface: 'bg-sky-400/10' },
} as const;

function Note({ note }: { readonly note: string }) {
  const { tileTextClassName } = useTileTextSize();

  return note === '' ? null : <p className={`text-foreground/50 truncate italic ${tileTextClassName}`}>{note}</p>;
}

const TILE_BUTTON_CLASS_NAME = 'self-start rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60';

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
  const { is24Hour } = useClockFormat();
  const { tileTextClassName } = useTileTextSize();
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
          <span className={`text-foreground/70 tabular-nums ${tileTextClassName}`}>
            Slept {formatDuration(new Date(latest.endedAt).getTime() - new Date(latest.startedAt).getTime())} from {formatAgo(now - new Date(latest.startedAt).getTime())} to{' '}
            {formatAgo(now - new Date(latest.endedAt).getTime())}
          </span>
        )}
        {latest !== undefined && <Note note={latest.note} />}
        {predictions.map((prediction) => (
          <span className={`text-foreground/70 tabular-nums ${tileTextClassName}`} key={prediction.napCount}>
            {prediction.napCount}-nap day: {prediction.label} at {formatClockTime(prediction.time, is24Hour)} ({formatAgo(now - prediction.time)})
          </span>
        ))}
        {active === undefined && latest === undefined && <span className={`text-foreground/50 ${tileTextClassName}`}>No sleeps yet.</span>}
      </Link>
      <div className="flex gap-2">
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
      </div>
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
    </div>
  );
}

/**
 * The whole tile adds a bottle, through a link stretched underneath everything else; the content lets taps fall through to it. Edit is the one thing on top that catches its own taps. New does nothing of its own — it is there to say what tapping the tile does.
 */
function BottleTile({ now, summary }: { readonly now: number; readonly summary: TrackingSummary }) {
  const { tileTextClassName } = useTileTextSize();
  const bottle = summary.latestBottle;
  const colors = TILE_COLORS.bottle;
  const amounts =
    bottle === null
      ? []
      : [bottle.amountMilliliters === null ? '' : `${bottle.amountMilliliters} ml`, bottle.drankMilliliters === null ? '' : `drank ${bottle.drankMilliliters} ml`].filter(
          (amount) => amount !== '',
        );

  return (
    <div className={`relative flex flex-col gap-3 rounded-2xl border p-4 ${colors.border} ${colors.surface}`}>
      <Link aria-label="New bottle" className="absolute inset-0 rounded-2xl" href="/track/bottle" />
      <div className="pointer-events-none relative flex flex-col gap-1">
        <span className={`text-lg font-semibold ${colors.label}`}>Bottle</span>
        {bottle === null ? (
          <span className={`text-foreground/50 ${tileTextClassName}`}>No bottles yet.</span>
        ) : (
          <>
            <span className={`text-foreground/70 tabular-nums ${tileTextClassName}`}>Prepared {formatAgo(now - new Date(bottle.preparedAt).getTime())}</span>
            {bottle.touchedLipsAt !== null && (
              <span className={`text-foreground/70 tabular-nums ${tileTextClassName}`}>Touched lips {formatAgo(now - new Date(bottle.touchedLipsAt).getTime())}</span>
            )}
            {amounts.length > 0 && <span className={`text-foreground/70 ${tileTextClassName}`}>{amounts.join(', ')}</span>}
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
  const { tileTextClassName } = useTileTextSize();
  const diaper = summary.latestDiaper;
  const colors = TILE_COLORS.diaper;

  return (
    <Link className={`flex flex-col gap-1 rounded-2xl border p-4 ${colors.border} ${colors.surface}`} href="/track/diaper">
      <span className={`text-lg font-semibold ${colors.label}`}>Diaper</span>
      {diaper === null ? (
        <span className={`text-foreground/50 ${tileTextClassName}`}>No diapers yet.</span>
      ) : (
        <>
          <span className={`text-foreground/70 tabular-nums ${tileTextClassName}`}>{formatAgo(now - new Date(diaper.changedAt).getTime())}</span>
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
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link aria-label="Tracking settings" className="text-foreground/40 p-1" href="/settings">
          <SettingsIcon className="size-5" />
        </Link>
      </div>
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      {summary !== null && now !== null && (
        <>
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
        </>
      )}
    </div>
  );
}
