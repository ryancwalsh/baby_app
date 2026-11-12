import { query } from '../storage/database.js';

/**
 * Prints the worker's thermostat decisions, oldest first, in °F and the laptop's local time. Read only: it touches neither the thermostat nor the camera. Pass a number of hours to look back, 24 by default.
 *
 * NODE_ENV=production yarn tsx --env-file=.env --env-file=.env.production.local scripts/thermostat-log.ts 12
 */
const DEFAULT_HOURS = 24;
const MILLISECONDS_PER_HOUR = 3_600_000;

function toFahrenheit(celsius: unknown) {
  return celsius === null || celsius === undefined ? '' : ((Number(celsius) * 9) / 5 + 32).toFixed(1);
}

function toOffsetFahrenheit(celsius: unknown) {
  return celsius === null || celsius === undefined ? '' : ((Number(celsius) * 9) / 5).toFixed(1);
}

async function main() {
  const hours = Number(process.argv[2] ?? DEFAULT_HOURS);
  const since = new Date(Date.now() - hours * MILLISECONDS_PER_HOUR).toISOString();
  const [settings] = (await query('SELECT crib_low_celsius, crib_high_celsius FROM settings WHERE id = 1')).rows;
  console.log(`Crib range: ${toFahrenheit(settings?.crib_low_celsius) || 'not set'}–${toFahrenheit(settings?.crib_high_celsius) || 'not set'} °F`);

  const { rows } = await query('SELECT * FROM thermostat_decisions WHERE decided_at >= ? ORDER BY decided_at', [since]);
  console.table(
    rows.map((row) => ({
      at: new Date(String(row.decided_at)).toLocaleString(),
      crib: toFahrenheit(row.crib_celsius),
      currentCool: toFahrenheit(row.current_cool_celsius),
      currentHeat: toFahrenheit(row.current_heat_celsius),
      hallway: toFahrenheit(row.hallway_celsius),
      mode: row.mode ?? '',
      offset: toOffsetFahrenheit(row.offset_celsius),
      outcome: row.outcome,
      proposedCool: toFahrenheit(row.proposed_cool_celsius),
      proposedHeat: toFahrenheit(row.proposed_heat_celsius),
    })),
  );
}

await main();
