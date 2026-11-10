import { type CribRange } from '@/services/ecobee/decide';
import { query } from '@/storage/database';

/**
 * The crib's range, shared by every phone because there is one nursery, and the log of what the worker decided about the hallway thermostat. See ecobee_plan.md.
 */

/**
 * A range outside this is refused: 60–80 °F.
 */
const LOWEST_RANGE_CELSIUS = 15.5;
const HIGHEST_RANGE_CELSIUS = 26.7;

export type ThermostatDecisionRecord = {
  cribCelsius: null | number;
  currentCoolCelsius: null | number;
  currentHeatCelsius: null | number;
  decidedAt: string;
  hallwayCelsius: null | number;
  mode: null | string;
  offsetCelsius: null | number;
  outcome: string;
  proposedCoolCelsius: null | number;
  proposedHeatCelsius: null | number;
};

function toOptionalNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

export async function getCribRange(): Promise<CribRange | null> {
  const [row] = (await query('SELECT crib_low_celsius, crib_high_celsius FROM settings WHERE id = 1')).rows;
  const lowCelsius = toOptionalNumber(row?.crib_low_celsius);
  const highCelsius = toOptionalNumber(row?.crib_high_celsius);

  return lowCelsius === null || highCelsius === null ? null : { highCelsius, lowCelsius };
}

export async function saveCribRange(range: CribRange) {
  const { highCelsius, lowCelsius } = range;
  if (!Number.isFinite(lowCelsius) || !Number.isFinite(highCelsius) || lowCelsius < LOWEST_RANGE_CELSIUS || highCelsius > HIGHEST_RANGE_CELSIUS) {
    throw new Error('The crib range has to be between 60°F and 80°F.');
  }

  if (lowCelsius >= highCelsius) {
    throw new Error('The low end of the crib range has to be below the high end.');
  }

  await query('UPDATE settings SET crib_low_celsius = ?, crib_high_celsius = ? WHERE id = 1', [lowCelsius, highCelsius]);
}

export async function recordThermostatDecision(record: ThermostatDecisionRecord) {
  await query(
    'INSERT INTO thermostat_decisions (decided_at, outcome, crib_celsius, hallway_celsius, offset_celsius, mode, current_heat_celsius, current_cool_celsius, proposed_heat_celsius, proposed_cool_celsius) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      record.decidedAt,
      record.outcome,
      record.cribCelsius,
      record.hallwayCelsius,
      record.offsetCelsius,
      record.mode,
      record.currentHeatCelsius,
      record.currentCoolCelsius,
      record.proposedHeatCelsius,
      record.proposedCoolCelsius,
    ],
  );
}

export async function getLatestThermostatDecision(): Promise<null | ThermostatDecisionRecord> {
  const [row] = (await query('SELECT * FROM thermostat_decisions ORDER BY decided_at DESC LIMIT 1')).rows;

  return row === undefined
    ? null
    : {
        cribCelsius: toOptionalNumber(row.crib_celsius),
        currentCoolCelsius: toOptionalNumber(row.current_cool_celsius),
        currentHeatCelsius: toOptionalNumber(row.current_heat_celsius),
        decidedAt: String(row.decided_at),
        hallwayCelsius: toOptionalNumber(row.hallway_celsius),
        mode: row.mode === null ? null : String(row.mode),
        offsetCelsius: toOptionalNumber(row.offset_celsius),
        outcome: String(row.outcome),
        proposedCoolCelsius: toOptionalNumber(row.proposed_cool_celsius),
        proposedHeatCelsius: toOptionalNumber(row.proposed_heat_celsius),
      };
}
