import { query } from '@/storage/database';

/**
 * Device cloud tokens, kept in the database rather than in memory or under `secrets/`, so every instance of the app shares them and a cold start does not sign in again.
 */

export type StoredSecret = {
  updatedAt: string;
  value: string;
};

export async function readStoredSecret(name: string): Promise<null | StoredSecret> {
  const [row] = (await query('SELECT value, updated_at FROM stored_secrets WHERE name = ?', [name])).rows;

  return row === undefined ? null : { updatedAt: String(row.updated_at), value: String(row.value) };
}

export async function writeStoredSecret(name: string, value: string) {
  await query('INSERT INTO stored_secrets (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', [
    name,
    value,
    new Date().toISOString(),
  ]);
}
