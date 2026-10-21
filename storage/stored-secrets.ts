import { getDatabase, query } from '@/storage/database';

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

/**
 * Saves a secret only if it is still the one the caller read, identified by its `updatedAt` (or `null` for one that did not exist yet), and keeps the value it replaces in `stored_secret_history`. Returns whether it was saved.
 *
 * Two instances can refresh a token at the same moment. Without this, the slower one could overwrite a newer token with an older one; with it, the slower one finds it lost and reads the winner's instead.
 */
export async function compareAndSwapStoredSecret(name: string, expectedUpdatedAt: null | string, value: string): Promise<boolean> {
  const now = new Date().toISOString();
  const client = await getDatabase();
  let results;

  if (expectedUpdatedAt === null) {
    results = await client.batch(
      [{ args: [name, value, now], sql: 'INSERT INTO stored_secrets (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING' }],
      'write',
    );
  } else {
    results = await client.batch(
      [
        {
          args: [now, name, expectedUpdatedAt],
          sql: 'INSERT INTO stored_secret_history (name, value, updated_at, replaced_at) SELECT name, value, updated_at, ? FROM stored_secrets WHERE name = ? AND updated_at = ?',
        },
        { args: [value, now, name, expectedUpdatedAt], sql: 'UPDATE stored_secrets SET value = ?, updated_at = ? WHERE name = ? AND updated_at = ?' },
      ],
      'write',
    );
  }

  return (results.at(-1)?.rowsAffected ?? 0) > 0;
}
