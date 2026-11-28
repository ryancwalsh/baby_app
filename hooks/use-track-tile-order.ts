'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const TRACK_TILE_ORDER_KEY = 'baby-app-track-tile-order';

export const TRACK_TILES = [
  { label: 'Sleep', tile: 'sleep' },
  { label: 'Bottle', tile: 'bottle' },
  { label: 'Diaper', tile: 'diaper' },
  { label: 'Medicine', tile: 'medicine' },
  { label: 'Stopwatch', tile: 'stopwatch' },
] as const;

export type TrackTile = (typeof TRACK_TILES)[number]['tile'];

const DEFAULT_ORDER: TrackTile[] = TRACK_TILES.map(({ tile }) => tile);

function isTrackTile(value: unknown): value is TrackTile {
  return DEFAULT_ORDER.includes(value as TrackTile);
}

/**
 * Keeps the stored tiles in their stored order, drops any that no longer exist, and puts any it does not mention at the end, so a tile added later still shows up.
 */
export function parseTrackTileOrder(value: null | string | undefined): TrackTile[] {
  let stored: TrackTile[] = [];
  if (value !== null && value !== undefined) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        stored = parsed.filter((tile): tile is TrackTile => isTrackTile(tile));
      }
    } catch {
      stored = [];
    }
  }

  const unique = [...new Set(stored)];

  return [...unique, ...DEFAULT_ORDER.filter((tile) => !unique.includes(tile))];
}

/**
 * The order of the tiles on the Track page, per phone like the clock and date formats.
 */
export function useTrackTileOrder() {
  const { isLoaded, store, value } = useLocalStorage(TRACK_TILE_ORDER_KEY);

  return {
    isLoaded,
    setTileOrder: (next: TrackTile[]) => {
      store(JSON.stringify(next));
    },
    tileOrder: parseTrackTileOrder(value),
  };
}
