import { type Row } from '@libsql/client';

import { query } from '@/storage/database';
import { toFirst, toTime } from '@/storage/tracking';
import { type Medicine, type MedicineInput } from '@/storage/tracking-types';

function toMedicine(row: Row): Medicine {
  return {
    amountMilliliters: Number(row.amount_milliliters),
    givenAt: String(row.given_at),
    id: Number(row.id),
    name: String(row.name),
  };
}

function validateMedicine(input: MedicineInput): MedicineInput {
  const name = input.name.trim();
  if (name === '') {
    throw new Error('Name the medicine.');
  }

  if (!Number.isFinite(input.amountMilliliters) || input.amountMilliliters <= 0) {
    throw new TypeError('The amount must be more than 0 ml.');
  }

  return { amountMilliliters: input.amountMilliliters, givenAt: toTime(input.givenAt, 'Time'), name };
}

export async function listMedicines(): Promise<Medicine[]> {
  return (await query('SELECT * FROM medicines ORDER BY given_at DESC')).rows.map(toMedicine);
}

/**
 * Every medicine ever given, most recently given first, each spelling once however its letters were cased.
 */
export async function listMedicineNames(): Promise<string[]> {
  const result = await query('SELECT name, MAX(given_at) AS last_given_at FROM medicines GROUP BY name COLLATE NOCASE ORDER BY last_given_at DESC');

  return result.rows.map((row) => String(row.name));
}

export async function getLatestMedicine(): Promise<Medicine | null> {
  const result = await query('SELECT * FROM medicines ORDER BY given_at DESC LIMIT 1');

  return toFirst(result.rows, toMedicine);
}

export async function getMedicine(id: number): Promise<Medicine | null> {
  const result = await query('SELECT * FROM medicines WHERE id = ?', [id]);

  return toFirst(result.rows, toMedicine);
}

export async function saveMedicine(id: null | number, input: MedicineInput) {
  const { amountMilliliters, givenAt, name } = validateMedicine(input);
  if (id === null) {
    await query('INSERT INTO medicines (given_at, name, amount_milliliters) VALUES (?, ?, ?)', [givenAt, name, amountMilliliters]);
  } else {
    await query('UPDATE medicines SET given_at = ?, name = ?, amount_milliliters = ? WHERE id = ?', [givenAt, name, amountMilliliters, id]);
  }
}

export async function deleteMedicine(id: number) {
  await query('DELETE FROM medicines WHERE id = ?', [id]);
}
