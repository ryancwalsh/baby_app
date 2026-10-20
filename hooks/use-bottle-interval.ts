'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const BOTTLE_INTERVAL_KEY = 'baby-app-bottle-interval-minutes';

const DEFAULT_BOTTLE_INTERVAL_MINUTES = 180;

/**
 * How long after one bottle the next is due, per phone like the clock and date formats. Anything unreadable, or not a positive whole number, is the default.
 */
export function useBottleInterval() {
  const { store, value } = useLocalStorage(BOTTLE_INTERVAL_KEY);
  const parsed = value === null || value === undefined ? Number.NaN : Number(value);

  return {
    bottleIntervalMinutes: Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BOTTLE_INTERVAL_MINUTES,
    setBottleIntervalMinutes: (next: number) => {
      store(String(next));
    },
  };
}
