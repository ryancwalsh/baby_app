'use client';

import { DATE_FORMATS, type DateFormat } from '@/components/tracking-format';
import { useLocalStorage } from '@/hooks/use-local-storage';

const DATE_FORMAT_KEY = 'baby-app-date-format';
const DEFAULT_DATE_FORMAT: DateFormat = 'iso-weekday';

/**
 * Per phone, like the clock format. An unknown stored value falls back to the default rather than breaking the dates.
 */
export function useDateFormat() {
  const { store, value } = useLocalStorage(DATE_FORMAT_KEY);

  return {
    dateFormat: DATE_FORMATS.find((format) => format === value) ?? DEFAULT_DATE_FORMAT,
    setDateFormat: (next: DateFormat) => {
      store(next);
    },
  };
}
