'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const CLOCK_FORMAT_KEY = 'baby-app-clock-format';

/**
 * Kept per phone rather than in the database, since it is about whoever is holding the phone. 24-hour is the default because it is what the clock showed before there was a choice.
 */
export function useClockFormat() {
  const { store, value } = useLocalStorage(CLOCK_FORMAT_KEY);
  const is24Hour = value !== '12';

  return {
    is24Hour,
    setIs24Hour: (next: boolean) => {
      store(next ? '24' : '12');
    },
  };
}
