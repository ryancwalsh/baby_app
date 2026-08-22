/**
 * Failed-attempt tracking, kept in memory. That is sound here because the app
 * runs as one long-lived process at home rather than as serverless instances
 * that would each keep their own tally — the same reason the token files work.
 */

const MAXIMUM_FAILURES = 5;
const WINDOW_MILLISECONDS = 15 * 60 * 1_000;

type Failures = {
  count: number;
  firstFailureAt: number;
};

/**
 * Survives the module re-evaluation that `next dev` does on every edit.
 */
const globalForRateLimit = globalThis as typeof globalThis & {
  loginFailures?: Map<string, Failures>;
};

function getFailures(): Map<string, Failures> {
  globalForRateLimit.loginFailures ??= new Map();

  return globalForRateLimit.loginFailures;
}

/**
 * Seconds still to wait, or null when this client may try again now.
 */
export function getLockoutSeconds(client: string): null | number {
  const failures = getFailures().get(client);
  let lockoutSeconds: null | number = null;

  if (failures !== undefined && failures.count >= MAXIMUM_FAILURES) {
    const remaining = failures.firstFailureAt + WINDOW_MILLISECONDS - Date.now();
    if (remaining > 0) {
      lockoutSeconds = Math.ceil(remaining / 1_000);
    } else {
      /**
       * The window has passed, so the slate is clean again.
       */
      getFailures().delete(client);
    }
  }

  return lockoutSeconds;
}

export function recordFailure(client: string) {
  const failures = getFailures();
  const existing = failures.get(client);

  if (existing === undefined || Date.now() - existing.firstFailureAt > WINDOW_MILLISECONDS) {
    failures.set(client, { count: 1, firstFailureAt: Date.now() });
  } else {
    existing.count += 1;
  }
}

export function clearFailures(client: string) {
  getFailures().delete(client);
}
