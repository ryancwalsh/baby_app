'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import { TILE_BUTTON_CLASS_NAME, TILE_COLORS } from '@/components/tile-styles';
import { formatRunningDuration } from '@/components/tracking-format';
import { useLocalStorage } from '@/hooks/use-local-storage';

const STOPWATCH_KEY = 'baby-app-stopwatch';

type Stopwatch = {
  /**
   * Time banked by earlier runs, before the current one started.
   */
  elapsedMilliseconds: number;
  startedAt: null | number;
};

const STOPPED_STOPWATCH: Stopwatch = { elapsedMilliseconds: 0, startedAt: null };

function parseStopwatch(value: null | string | undefined): Stopwatch {
  let stopwatch = STOPPED_STOPWATCH;
  if (value !== null && value !== undefined) {
    try {
      stopwatch = { ...STOPPED_STOPWATCH, ...(JSON.parse(value) as Partial<Stopwatch>) };
    } catch {
      /**
       * Anything unreadable is a stopwatch at zero.
       */
    }
  }

  return stopwatch;
}

/**
 * Per phone, in local storage, and kept as the moment it started rather than a ticking count, so it keeps time while the screen is locked and survives a reload.
 */
export function StopwatchTile({ now }: { readonly now: number }) {
  const { store, value } = useLocalStorage(STOPWATCH_KEY);
  const stopwatch = parseStopwatch(value);
  const isRunning = stopwatch.startedAt !== null;
  const elapsed = stopwatch.elapsedMilliseconds + (stopwatch.startedAt === null ? 0 : now - stopwatch.startedAt);
  const colors = TILE_COLORS.stopwatch;
  const [isBlackedOut, setIsBlackedOut] = useState(false);
  const formattedElapsed = formatRunningDuration(elapsed);

  let startLabel = 'Start';
  if (isRunning) {
    startLabel = 'Pause';
  } else if (elapsed > 0) {
    startLabel = 'Resume';
  }

  return (
    <div className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 ${colors.border} ${colors.surface}`}>
      {/*
        Like the clock, tapping a running stopwatch blacks out the whole screen but for the count, for timing something in the dark nursery.
      */}
      <button
        aria-label={isRunning ? 'Black out the screen' : undefined}
        className="flex flex-col gap-1 text-left disabled:cursor-default"
        disabled={!isRunning}
        onClick={() => {
          setIsBlackedOut(true);
        }}
        type="button"
      >
        <span className={`text-lg font-semibold ${colors.label}`}>Stopwatch</span>
        <span className="text-2xl tabular-nums">{formattedElapsed}</span>
      </button>
      <div className="flex gap-2">
        <button
          className={`${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`}
          onClick={() => {
            const current = Date.now();
            store(
              JSON.stringify(
                stopwatch.startedAt === null
                  ? { elapsedMilliseconds: stopwatch.elapsedMilliseconds, startedAt: current }
                  : { elapsedMilliseconds: stopwatch.elapsedMilliseconds + current - stopwatch.startedAt, startedAt: null },
              ),
            );
          }}
          type="button"
        >
          {startLabel}
        </button>
        {(isRunning || elapsed > 0) && (
          <button
            className={`${TILE_BUTTON_CLASS_NAME} ${colors.border} ${colors.label}`}
            onClick={() => {
              store(null);
            }}
            type="button"
          >
            Reset
          </button>
        )}
      </div>

      {/*
        Portaled to the body, because the tiles sit inside a CSS `zoom` for the per-phone text size, which would otherwise scale the blackout too.
      */}
      {isRunning &&
        isBlackedOut &&
        createPortal(
          <button
            aria-label="Leave the blacked out screen"
            className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black text-[15vw] whitespace-nowrap text-white/70 tabular-nums"
            onClick={() => {
              setIsBlackedOut(false);
            }}
            type="button"
          >
            {formattedElapsed}
          </button>,
          document.body,
        )}
    </div>
  );
}
