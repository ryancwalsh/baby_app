'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const TILE_TEXT_SIZE_KEY = 'baby-app-tile-text-size';
const FORM_TEXT_SIZE_KEY = 'baby-app-form-text-size';
const LOG_TEXT_SIZE_KEY = 'baby-app-log-text-size';

/**
 * Smallest first, the order they are offered in. Each is a CSS `zoom`, so the titles, the readings, the buttons, and the room around them all grow together rather than only the gray text. Medium is how everything looked before there was a choice.
 */
export const TEXT_SIZES = [
  { label: 'Small', size: 'small', zoom: 0.9 },
  { label: 'Medium', size: 'medium', zoom: 1 },
  { label: 'Large', size: 'large', zoom: 1.2 },
  { label: 'Extra large', size: 'extra-large', zoom: 1.4 },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]['size'];

const DEFAULT_TEXT_SIZE = TEXT_SIZES[1];

function useTextSize(key: string) {
  const { store, value } = useLocalStorage(key);
  const textSize = TEXT_SIZES.find(({ size }) => size === value) ?? DEFAULT_TEXT_SIZE;

  return {
    setTextSize: (next: TextSize) => {
      store(next);
    },
    textSize: textSize.size,
    zoom: textSize.zoom,
  };
}

/**
 * The size of everything on the track page's tiles, per phone like the clock and date formats.
 */
export function useTileTextSize() {
  return useTextSize(TILE_TEXT_SIZE_KEY);
}

/**
 * The size of everything on the pages that add or edit a sleep, a bottle, or a diaper, per phone.
 */
export function useFormTextSize() {
  return useTextSize(FORM_TEXT_SIZE_KEY);
}

/**
 * The size of everything in the tracking list's log of days and their entries, per phone.
 */
export function useLogTextSize() {
  return useTextSize(LOG_TEXT_SIZE_KEY);
}
