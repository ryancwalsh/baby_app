'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const BOTTLE_RESUME_DELAY_KEY = 'baby-app-bottle-resume-delay-minutes';

const DEFAULT_BOTTLE_RESUME_DELAY_MINUTES = 30;

/**
 * How long after touched lips the bottle tile offers Resume, per phone like the minutes between bottles. Anything unreadable, or not a positive whole number, is the default.
 */
export function useBottleResumeDelay() {
  const { store, value } = useLocalStorage(BOTTLE_RESUME_DELAY_KEY);
  const parsed = value === null || value === undefined ? Number.NaN : Number(value);

  return {
    bottleResumeDelayMinutes: Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BOTTLE_RESUME_DELAY_MINUTES,
    setBottleResumeDelayMinutes: (next: number) => {
      store(String(next));
    },
  };
}
