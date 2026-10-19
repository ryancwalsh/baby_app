'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const TILE_TEXT_SIZE_KEY = 'baby-app-tile-text-size';

/**
 * Smallest first, the order they are offered in.
 */
export const TILE_TEXT_SIZES = [
  { className: 'text-sm', label: 'Small', size: 'small' },
  { className: 'text-base', label: 'Medium', size: 'medium' },
  { className: 'text-lg', label: 'Large', size: 'large' },
  { className: 'text-xl', label: 'Extra large', size: 'extra-large' },
] as const;

export type TileTextSize = (typeof TILE_TEXT_SIZES)[number]['size'];

const DEFAULT_TILE_TEXT_SIZE = TILE_TEXT_SIZES[1];

/**
 * The size of the gray text on the tiles, per phone like the clock and date formats. Small is what the tiles showed before there was a choice.
 */
export function useTileTextSize() {
  const { store, value } = useLocalStorage(TILE_TEXT_SIZE_KEY);
  const tileTextSize = TILE_TEXT_SIZES.find(({ size }) => size === value) ?? DEFAULT_TILE_TEXT_SIZE;

  return {
    setTileTextSize: (next: TileTextSize) => {
      store(next);
    },
    tileTextClassName: tileTextSize.className,
    tileTextSize: tileTextSize.size,
  };
}
