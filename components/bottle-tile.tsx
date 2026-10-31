'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { resumeBottleNowAction, type TrackingSummary } from '@/app/actions/tracking';
import { NextBottle } from '@/components/next-bottle';
import { TileNote } from '@/components/tile-note';
import { TILE_BUTTON_CLASS_NAME, TILE_COLORS } from '@/components/tile-styles';
import { formatAgo } from '@/components/tracking-format';
import { MILLISECONDS_PER_MINUTE } from '@/constants/time';
import { useBottleInterval } from '@/hooks/use-bottle-interval';
import { useBottleResumeDelay } from '@/hooks/use-bottle-resume-delay';
import { getBottleTime, useBottleTime } from '@/hooks/use-bottle-time';
import { useClockFormat } from '@/hooks/use-clock-format';

/**
 * The whole tile adds a bottle, through a link stretched underneath everything else; the content lets taps fall through to it. Edit and Resume are the things on top that catch their own taps. New does nothing of its own — it is there to say what tapping the tile does.
 */
export function BottleTile({
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
  const { is24Hour } = useClockFormat();
  const { bottleTimeBasis } = useBottleTime();
  const { bottleIntervalMinutes } = useBottleInterval();
  const { bottleResumeDelayMinutes } = useBottleResumeDelay();
  const bottle = summary.latestBottle;
  const colors = TILE_COLORS.bottle;
  const amounts =
    bottle === null
      ? []
      : [bottle.amountMilliliters === null ? '' : `${bottle.amountMilliliters} ml`, bottle.drankMilliliters === null ? '' : `drank ${bottle.drankMilliliters} ml`].filter(
          (amount) => amount !== '',
        );
  const nextBottleTime = bottle === null ? null : getBottleTime(bottle, bottleTimeBasis) + bottleIntervalMinutes * MILLISECONDS_PER_MINUTE;
  const canResume = bottle !== null && bottle.touchedLipsAt !== null && now - new Date(bottle.touchedLipsAt).getTime() > bottleResumeDelayMinutes * MILLISECONDS_PER_MINUTE;

  function resume(id: number) {
    startTransition(async () => {
      const result = await resumeBottleNowAction(secretHash, id);
      setError(result.error);
      onChange();
    });
  }

  return (
    <div className={`relative flex flex-col gap-3 rounded-2xl border p-4 ${colors.border} ${colors.surface}`}>
      <Link aria-label="New bottle" className="absolute inset-0 rounded-2xl" href="/track/bottle" />
      <div className="pointer-events-none relative flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-lg font-semibold ${colors.label}`}>Bottle</span>
          {nextBottleTime !== null && <NextBottle is24Hour={is24Hour} nextBottleTime={nextBottleTime} now={now} />}
        </div>
        {bottle === null ? (
          <span className="text-faint text-base">No bottles yet.</span>
        ) : (
          <>
            <span className="text-foreground/70 tabular-nums text-base">Prepared {formatAgo(now - new Date(bottle.preparedAt).getTime())}</span>
            {bottle.touchedLipsAt !== null && (
              <span className="text-foreground/70 tabular-nums text-base">Touched lips {formatAgo(now - new Date(bottle.touchedLipsAt).getTime())}</span>
            )}
            {bottle.resumedAt !== null && <span className="text-foreground/70 tabular-nums text-base">Resumed {formatAgo(now - new Date(bottle.resumedAt).getTime())}</span>}
            {amounts.length > 0 && <span className="text-foreground/70 text-base">{amounts.join(', ')}</span>}
            <TileNote note={bottle.note} />
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
        {bottle !== null && canResume && (
          <button
            className={`pointer-events-auto ${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`}
            disabled={isPending}
            onClick={() => {
              resume(bottle.id);
            }}
            type="button"
          >
            Resume
          </button>
        )}
      </div>
      {error !== null && <p className="pointer-events-none relative text-sm text-accent">{error}</p>}
    </div>
  );
}
