'use client';

import { formatClockTime } from '@/components/tracking-format';
import { MILLISECONDS_PER_MINUTE } from '@/constants/time';

/**
 * When the next bottle is due, counted from the last one's time in the log on this phone. Once it is overdue, it says how long ago it was due instead.
 */
export function NextBottle({ is24Hour, nextBottleTime, now }: { readonly is24Hour: boolean; readonly nextBottleTime: number; readonly now: number }) {
  const minutes = Math.round((nextBottleTime - now) / MILLISECONDS_PER_MINUTE);

  return (
    <span className="text-foreground/70 text-base tabular-nums">
      Next: {formatClockTime(nextBottleTime, is24Hour)} ({minutes >= 0 ? `in ${minutes}m` : `${-minutes}m ago`})
    </span>
  );
}
