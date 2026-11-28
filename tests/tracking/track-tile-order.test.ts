import { describe, expect, it } from 'vitest';

import { parseTrackTileOrder } from '@/hooks/use-track-tile-order';

describe('parseTrackTileOrder', () => {
  it('uses the default order when nothing is stored', () => {
    expect(parseTrackTileOrder(null)).toEqual(['sleep', 'bottle', 'diaper', 'medicine', 'stopwatch']);
  });

  it('keeps the stored order and adds tiles it does not mention at the end', () => {
    expect(parseTrackTileOrder(JSON.stringify(['diaper', 'sleep']))).toEqual(['diaper', 'sleep', 'bottle', 'medicine', 'stopwatch']);
  });

  it('drops unknown and repeated tiles, and ignores anything unreadable', () => {
    expect(parseTrackTileOrder(JSON.stringify(['stopwatch', 'gone', 'stopwatch']))).toEqual(['stopwatch', 'sleep', 'bottle', 'diaper', 'medicine']);
    expect(parseTrackTileOrder('not json')).toEqual(['sleep', 'bottle', 'diaper', 'medicine', 'stopwatch']);
  });
});
