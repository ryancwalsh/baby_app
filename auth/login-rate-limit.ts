import { query } from '@/storage/database';

/**
 * Failed-attempt tracking, kept in the database so that every instance of the app, and the laptop beside them, counts against the same tally. Guessing against one is guessing against all of them.
 *
 * A database that cannot be reached is logged and treated as no failures, rather than locking everyone out of the nursery: the hash still has to be right.
 */

const MAXIMUM_FAILURES = 5;
const WINDOW_MILLISECONDS = 15 * 60 * 1_000;

export type Lockout = {
  /**
   * Whether there is anything to clear after a success, so a success with a clean slate costs no write.
   */
  hasFailures: boolean;
  /**
   * Seconds still to wait, or null when this client may try again now.
   */
  lockoutSeconds: null | number;
};

export async function getLockout(client: string): Promise<Lockout> {
  let hasFailures = false;
  let lockoutSeconds: null | number = null;

  try {
    const [row] = (await query('SELECT failure_count, first_failed_at FROM login_failures WHERE client = ?', [client])).rows;
    hasFailures = row !== undefined;
    if (row !== undefined && Number(row.failure_count) >= MAXIMUM_FAILURES) {
      const remaining = new Date(String(row.first_failed_at)).getTime() + WINDOW_MILLISECONDS - Date.now();
      if (remaining > 0) {
        lockoutSeconds = Math.ceil(remaining / 1_000);
      }
    }
  } catch (error) {
    console.error('Could not read the login throttle.', error);
  }

  return { hasFailures, lockoutSeconds };
}

/**
 * A failure after the window has passed starts a fresh count.
 */
export async function recordFailure(client: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MILLISECONDS).toISOString();

  try {
    await query(
      `INSERT INTO login_failures (client, failure_count, first_failed_at) VALUES (?, 1, ?)
      ON CONFLICT (client) DO UPDATE SET
        failure_count = CASE WHEN first_failed_at < ? THEN 1 ELSE failure_count + 1 END,
        first_failed_at = CASE WHEN first_failed_at < ? THEN excluded.first_failed_at ELSE first_failed_at END`,
      [client, now.toISOString(), windowStart, windowStart],
    );
  } catch (error) {
    console.error('Could not record a failed login.', error);
  }
}

export async function clearFailures(client: string) {
  try {
    await query('DELETE FROM login_failures WHERE client = ?', [client]);
  } catch (error) {
    console.error('Could not clear failed logins.', error);
  }
}
