import { describe, expect, it, vi } from 'vitest';

import { applyLullabyOrder } from '@/storage/lullaby-order';

vi.mock('@/storage/database', () => ({ query: vi.fn() }));

describe('the lullaby order', () => {
  it('lists the files in the stored order, with ones it does not mention after, and skips ones that are gone', () => {
    expect(applyLullabyOrder(['a.mp3', 'b.mp3', 'c.mp3', 'new.mp3'], ['c.mp3', 'deleted.mp3', 'a.mp3', 'b.mp3'])).toEqual(['c.mp3', 'a.mp3', 'b.mp3', 'new.mp3']);
  });

  it('keeps the default order when nothing has been stored', () => {
    expect(applyLullabyOrder(['a.mp3', 'b.mp3'], [])).toEqual(['a.mp3', 'b.mp3']);
  });
});
