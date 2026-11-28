import { createClient, type InValue } from '@libsql/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordThermostatDecision, THERMOSTAT_DECISIONS_KEPT, type ThermostatDecisionRecord } from '@/storage/thermostat';

const client = createClient({ url: ':memory:' });

vi.mock('@/storage/database', () => ({ query: async (sql: string, args: InValue[] = []) => client.execute({ args, sql }) }));

const RECORD: ThermostatDecisionRecord = {
  cribCelsius: 20,
  currentCoolCelsius: 24,
  currentHeatCelsius: 19,
  decidedAt: '2026-11-28T00:00:00.000Z',
  hallwayCelsius: 21,
  mode: 'heat',
  offsetCelsius: 1,
  outcome: 'left as it is',
  proposedCoolCelsius: null,
  proposedHeatCelsius: null,
};

async function countDecisions() {
  const [row] = (await client.execute('SELECT COUNT(*) AS count, MIN(id) AS lowest, MAX(id) AS highest FROM thermostat_decisions')).rows;
  return { count: Number(row?.count), highest: Number(row?.highest), lowest: Number(row?.lowest) };
}

describe('the thermostat decision log', () => {
  beforeEach(async () => {
    await client.execute('DROP TABLE IF EXISTS thermostat_decisions');
    await client.execute(
      'CREATE TABLE thermostat_decisions (id INTEGER PRIMARY KEY AUTOINCREMENT, decided_at TEXT NOT NULL, outcome TEXT NOT NULL, crib_celsius REAL, hallway_celsius REAL, offset_celsius REAL, mode TEXT, current_heat_celsius REAL, current_cool_celsius REAL, proposed_heat_celsius REAL, proposed_cool_celsius REAL)',
    );
  });

  it('keeps every decision while there are fewer than the limit', async () => {
    await recordThermostatDecision(RECORD);
    await recordThermostatDecision(RECORD);

    expect(await countDecisions()).toEqual({ count: 2, highest: 2, lowest: 1 });
  });

  it('deletes the oldest decisions once the log passes the limit', async () => {
    await client.execute({
      args: [THERMOSTAT_DECISIONS_KEPT],
      sql: "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?) INSERT INTO thermostat_decisions (decided_at, outcome) SELECT '2026-11-01T00:00:00.000Z', 'left as it is' FROM n",
    });

    await recordThermostatDecision(RECORD);
    await recordThermostatDecision(RECORD);

    expect(await countDecisions()).toEqual({ count: THERMOSTAT_DECISIONS_KEPT, highest: THERMOSTAT_DECISIONS_KEPT + 2, lowest: 3 });
  });
});
