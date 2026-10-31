import { createClient, type InValue } from '@libsql/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIGRATIONS } from '@/storage/migrations';
import { getBottle, resumeBottleNow, saveBottle } from '@/storage/tracking';

const database = vi.hoisted(() => ({ client: null as null | ReturnType<typeof createClient> }));

vi.mock('@/storage/database', () => ({
  query: async (sql: string, parameters: InValue[] = []) => {
    if (database.client === null) {
      throw new Error('No database.');
    }

    return await database.client.execute({ args: parameters, sql });
  },
}));

const TOUCHED_LIPS_AT = '2026-10-31T01:00:00.000Z';
const RESUMED_AT = '2026-10-31T01:30:00.000Z';
const INPUT = {
  amountMilliliters: 90,
  drankMilliliters: null,
  note: '',
  preparedAt: '2026-10-31T00:55:00.000Z',
  resumedAt: null,
  touchedLipsAt: TOUCHED_LIPS_AT,
};

async function saveFirstBottle(input = INPUT) {
  await saveBottle(null, input);

  const bottle = await getBottle(1);

  if (bottle === null) {
    throw new Error('The bottle was not saved.');
  }

  return bottle;
}

describe('a resumed bottle', () => {
  beforeEach(async () => {
    database.client = createClient({ url: ':memory:' });

    for (const migration of MIGRATIONS) {
      for (const statement of migration.statements) {
        await database.client.execute(statement);
      }
    }
  });

  it('starts with no resumed time', async () => {
    expect((await saveFirstBottle()).resumedAt).toBeNull();
  });

  it('keeps a resumed time from the form', async () => {
    expect((await saveFirstBottle({ ...INPUT, resumedAt: RESUMED_AT })).resumedAt).toBe(RESUMED_AT);
  });

  it('drops a resumed time when there is no touched lips time for it to follow', async () => {
    expect((await saveFirstBottle({ ...INPUT, resumedAt: RESUMED_AT, touchedLipsAt: null })).resumedAt).toBeNull();
  });

  it('overwrites an earlier resumed time when resumed again', async () => {
    const bottle = await saveFirstBottle({ ...INPUT, resumedAt: RESUMED_AT });
    const before = Date.now();

    await resumeBottleNow(bottle.id);

    const resumed = await getBottle(bottle.id);

    expect(new Date(resumed?.resumedAt ?? 0).getTime()).toBeGreaterThanOrEqual(before);
    expect(resumed?.touchedLipsAt).toBe(TOUCHED_LIPS_AT);
  });
});
