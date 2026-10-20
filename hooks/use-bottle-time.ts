'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';
import { type Bottle } from '@/storage/tracking-types';

const BOTTLE_TIME_KEY = 'baby-app-bottle-time';

/**
 * Which of a bottle's two times places it in the log, in the order they are offered. Touched lips is the default, since that is when the feed began.
 */
export const BOTTLE_TIMES = [
  { basis: 'touched-lips', label: 'Touched lips' },
  { basis: 'prepared', label: 'Prepared' },
] as const;

export type BottleTimeBasis = (typeof BOTTLE_TIMES)[number]['basis'];

/**
 * A bottle that never touched lips falls back to when it was prepared, since that is the only time it has.
 */
export function getBottleTime(bottle: Bottle, basis: BottleTimeBasis): number {
  return new Date(basis === 'touched-lips' && bottle.touchedLipsAt !== null ? bottle.touchedLipsAt : bottle.preparedAt).getTime();
}

/**
 * Per phone, like the clock and date formats.
 */
export function useBottleTime() {
  const { store, value } = useLocalStorage(BOTTLE_TIME_KEY);
  const bottleTime = BOTTLE_TIMES.find(({ basis }) => basis === value) ?? BOTTLE_TIMES[0];

  return {
    bottleTimeBasis: bottleTime.basis,
    setBottleTimeBasis: (next: BottleTimeBasis) => {
      store(next);
    },
  };
}
