'use client';

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

  let startLabel = 'Start';
  if (isRunning) {
    startLabel = 'Pause';
  } else if (elapsed > 0) {
    startLabel = 'Resume';
  }

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 ${colors.border} ${colors.surface}`}>
      <div className="flex flex-col gap-1">
        <span className={`text-lg font-semibold ${colors.label}`}>Stopwatch</span>
        <span className="text-2xl tabular-nums">{formatRunningDuration(elapsed)}</span>
      </div>
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
    </div>
  );
}
