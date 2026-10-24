import { type Row } from '@libsql/client';

import { query } from '@/storage/database';
import { type Bottle, type BottleInput, type Diaper, type DiaperInput, type Sleep, type SleepInput } from '@/storage/tracking-types';

/**
 * Every time is stored as a UTC ISO string from `toISOString`, so that comparing two of them as text orders them in time — which is what the indexes and the `ORDER BY`s rely on.
 */

export type Value = Row[string] | undefined;

export function toOptionalString(value: Value) {
  return value === null || value === undefined ? null : String(value);
}

function toOptionalNumber(value: Value) {
  return value === null || value === undefined ? null : Number(value);
}

export function toFirst<T>(rows: Row[], convert: (row: Row) => T): null | T {
  const [row] = rows;

  return row === undefined ? null : convert(row);
}

function toSleep(row: Row): Sleep {
  return {
    endedAt: toOptionalString(row.ended_at),
    id: Number(row.id),
    note: String(row.note),
    startedAt: String(row.started_at),
  };
}

function toBottle(row: Row): Bottle {
  return {
    amountMilliliters: toOptionalNumber(row.prepared_milliliters),
    drankMilliliters: toOptionalNumber(row.drank_milliliters),
    id: Number(row.id),
    note: String(row.note),
    preparedAt: String(row.prepared_at),
    touchedLipsAt: toOptionalString(row.touched_lips_at),
  };
}

function toDiaper(row: Row): Diaper {
  return {
    changedAt: String(row.changed_at),
    id: Number(row.id),
    note: String(row.note),
  };
}

/**
 * Anything the browser sends is normalised here, so a time that is not a time never reaches the table.
 */
export function toTime(value: string, label: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} is not a valid time.`);
  }

  return date.toISOString();
}

function toOptionalTime(value: null | string, label: string): null | string {
  return value === null || value === '' ? null : toTime(value, label);
}

function toMilliliters(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a whole number of ml.`);
  }

  return value;
}

function validateSleep(input: SleepInput): SleepInput {
  const startedAt = toTime(input.startedAt, 'Start');
  const endedAt = toOptionalTime(input.endedAt, 'End');
  if (endedAt !== null && endedAt < startedAt) {
    throw new Error('A sleep cannot end before it starts.');
  }

  return { endedAt, note: input.note.trim(), startedAt };
}

function validateBottle(input: BottleInput): BottleInput {
  return {
    amountMilliliters: input.amountMilliliters === null ? null : toMilliliters(input.amountMilliliters, 'Prepared amount'),
    drankMilliliters: input.drankMilliliters === null ? null : toMilliliters(input.drankMilliliters, 'Drank'),
    note: input.note.trim(),
    preparedAt: toTime(input.preparedAt, 'Prepared'),
    touchedLipsAt: toOptionalTime(input.touchedLipsAt, 'Touched lips'),
  };
}

function validateDiaper(input: DiaperInput): DiaperInput {
  return { changedAt: toTime(input.changedAt, 'Time'), note: input.note.trim() };
}

export async function listSleeps(sinceIso: null | string = null): Promise<Sleep[]> {
  const result =
    sinceIso === null
      ? await query('SELECT * FROM sleeps ORDER BY started_at DESC')
      : await query('SELECT * FROM sleeps WHERE started_at >= ? OR ended_at IS NULL ORDER BY started_at DESC', [sinceIso]);

  return result.rows.map(toSleep);
}

export async function listBottles(): Promise<Bottle[]> {
  return (await query('SELECT * FROM bottles ORDER BY prepared_at DESC')).rows.map(toBottle);
}

export async function listDiapers(): Promise<Diaper[]> {
  return (await query('SELECT * FROM diapers ORDER BY changed_at DESC')).rows.map(toDiaper);
}

export async function getLatestBottle(): Promise<Bottle | null> {
  const result = await query('SELECT * FROM bottles ORDER BY prepared_at DESC LIMIT 1');

  return toFirst(result.rows, toBottle);
}

export async function getLatestDiaper(): Promise<Diaper | null> {
  const result = await query('SELECT * FROM diapers ORDER BY changed_at DESC LIMIT 1');

  return toFirst(result.rows, toDiaper);
}

export async function getSleep(id: number): Promise<null | Sleep> {
  const result = await query('SELECT * FROM sleeps WHERE id = ?', [id]);

  return toFirst(result.rows, toSleep);
}

export async function getBottle(id: number): Promise<Bottle | null> {
  const result = await query('SELECT * FROM bottles WHERE id = ?', [id]);

  return toFirst(result.rows, toBottle);
}

export async function getDiaper(id: number): Promise<Diaper | null> {
  const result = await query('SELECT * FROM diapers WHERE id = ?', [id]);

  return toFirst(result.rows, toDiaper);
}

/**
 * Saves a new entry when `id` is null, and overwrites that entry otherwise.
 */
export async function saveSleep(id: null | number, input: SleepInput) {
  const { endedAt, note, startedAt } = validateSleep(input);
  if (id === null) {
    await query('INSERT INTO sleeps (started_at, ended_at, note) VALUES (?, ?, ?)', [startedAt, endedAt, note]);
  } else {
    await query('UPDATE sleeps SET started_at = ?, ended_at = ?, note = ? WHERE id = ?', [startedAt, endedAt, note, id]);
  }
}

export async function saveBottle(id: null | number, input: BottleInput) {
  const { amountMilliliters, drankMilliliters, note, preparedAt, touchedLipsAt } = validateBottle(input);
  if (id === null) {
    await query('INSERT INTO bottles (prepared_at, touched_lips_at, amount_milliliters, prepared_milliliters, drank_milliliters, note) VALUES (?, ?, ?, ?, ?, ?)', [
      preparedAt,
      touchedLipsAt,
      amountMilliliters ?? 0,
      amountMilliliters,
      drankMilliliters,
      note,
    ]);
  } else {
    await query('UPDATE bottles SET prepared_at = ?, touched_lips_at = ?, amount_milliliters = ?, prepared_milliliters = ?, drank_milliliters = ?, note = ? WHERE id = ?', [
      preparedAt,
      touchedLipsAt,
      amountMilliliters ?? 0,
      amountMilliliters,
      drankMilliliters,
      note,
      id,
    ]);
  }
}

export async function saveDiaper(id: null | number, input: DiaperInput) {
  const { changedAt, note } = validateDiaper(input);
  if (id === null) {
    await query('INSERT INTO diapers (changed_at, note) VALUES (?, ?)', [changedAt, note]);
  } else {
    await query('UPDATE diapers SET changed_at = ?, note = ? WHERE id = ?', [changedAt, note, id]);
  }
}

export async function deleteSleep(id: number) {
  await query('DELETE FROM sleeps WHERE id = ?', [id]);
}

export async function deleteBottle(id: number) {
  await query('DELETE FROM bottles WHERE id = ?', [id]);
}

export async function deleteDiaper(id: number) {
  await query('DELETE FROM diapers WHERE id = ?', [id]);
}

/**
 * The one-tap start on the sleep tile. A sleep already running is left alone rather than doubled, since two taps from two phones mean the same thing.
 */
export async function startSleepNow() {
  const running = await query('SELECT id FROM sleeps WHERE ended_at IS NULL LIMIT 1');
  if (running.rows.length === 0) {
    await query("INSERT INTO sleeps (started_at, note) VALUES (?, '')", [new Date().toISOString()]);
  }
}

/**
 * Ends every running sleep, which is normally exactly one.
 */
export async function endSleepNow() {
  await query('UPDATE sleeps SET ended_at = ? WHERE ended_at IS NULL', [new Date().toISOString()]);
}
