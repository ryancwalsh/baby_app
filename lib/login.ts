import { timingSafeEqual } from 'node:crypto';

import { headers } from 'next/headers';

import { getEnvironment } from '@/lib/environment';
import { clearFailures, getLockoutSeconds, recordFailure } from '@/lib/login-rate-limit';

/**
 * The browser hashes the password and sends only the hash, so the hash is the
 * credential: every server action that touches a device calls `requireLogin`
 * first. Checking on the client alone would be decoration — anyone can write to
 * localStorage or call a server action directly.
 */

export type LoginAttempt = {
  isLoggedIn: boolean;
  /**
   * Seconds until this client may try again, or null when it may now.
   */
  lockedForSeconds: null | number;
};

/**
 * Behind the Cloudflare tunnel the real client is in `cf-connecting-ip`.
 * Everything here is spoofable by anything that can reach the origin directly,
 * so this slows down guessing from the internet rather than being an identity.
 */
async function getClient(): Promise<string> {
  const headerList = await headers();

  return headerList.get('cf-connecting-ip') ?? headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function matchesSecret(secretHash: string): boolean {
  /**
   * Deliberately outside any try: a missing or malformed LOGIN_SECRET is a
   * misconfiguration, and reporting it as "wrong password" would send someone
   * hunting for a typo in the password they got right.
   */
  const expected = Buffer.from(getEnvironment().LOGIN_SECRET, 'utf8');
  const given = Buffer.from(secretHash, 'utf8');

  /**
   * Compared in constant time, and only when the lengths already match.
   */
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The one place a hash is judged, so the throttle covers every route in: an
 * attacker who skips the login form and calls `toggleLampAction` directly is
 * counted just the same.
 */
export async function attemptLogin(secretHash: string): Promise<LoginAttempt> {
  const client = await getClient();
  const lockedForSeconds = getLockoutSeconds(client);

  if (lockedForSeconds !== null) {
    return { isLoggedIn: false, lockedForSeconds };
  }

  if (matchesSecret(secretHash)) {
    clearFailures(client);
    return { isLoggedIn: true, lockedForSeconds: null };
  }

  recordFailure(client);
  return { isLoggedIn: false, lockedForSeconds: null };
}

export async function requireLogin(secretHash: string): Promise<void> {
  const attempt = await attemptLogin(secretHash);

  if (!attempt.isLoggedIn) {
    throw new Error(attempt.lockedForSeconds === null ? 'Not logged in.' : `Too many attempts. Try again in ${Math.ceil(attempt.lockedForSeconds / 60)} minutes.`);
  }
}
