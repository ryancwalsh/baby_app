import { type MediaKind } from '@/services/nanit/media-files';
import { type NightLightState } from '@/services/nanit/night-light';

/**
 * How pages reach the worker, the laptop that holds the Nanit connection. Server actions are same-origin only, so once the pages are served from Vercel the Nanit is reached through the worker's own routes instead, at `NEXT_PUBLIC_WORKER_ORIGIN`. Empty, as on the laptop today, means the page's own origin.
 *
 * Nothing here retries a write: a press that fails is reported, so a camera that comes back is never written to by a press someone made minutes ago.
 */

// eslint-disable-next-line n/no-process-env -- Inlined at build time; this is the one place pages read it.
const WORKER_ORIGIN = process.env.NEXT_PUBLIC_WORKER_ORIGIN ?? '';

/**
 * For `EventSource` and media elements, which cannot send headers, so the login hash rides in the query string as it always has.
 */
export function getWorkerUrl(path: string, secretHash: string) {
  return `${WORKER_ORIGIN}/api/worker${path}?secretHash=${encodeURIComponent(secretHash)}`;
}

export function getWorkerHealthUrl() {
  return `${WORKER_ORIGIN}/api/worker/health`;
}

async function callWorker<Result>(path: string, secretHash: string, init: RequestInit = {}): Promise<Result> {
  const response = await fetch(`${WORKER_ORIGIN}/api/worker${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretHash}`, 'Content-Type': 'application/json' },
  });
  const body = (await response.json()) as Result | { error: string };

  if (!response.ok) {
    throw new Error(typeof body === 'object' && body !== null && 'error' in body ? body.error : 'Could not reach the laptop.');
  }

  return body as Result;
}

export function readNightLight(secretHash: string) {
  return callWorker<NightLightState>('/night-light', secretHash);
}

type NightLightRequest = { action: 'brightness'; brightness: number } | { action: 'power'; isOn: boolean } | { action: 'start-fade' } | { action: 'stop-fade' };

export function changeNightLight(secretHash: string, request: NightLightRequest) {
  return callWorker<NightLightState>('/night-light', secretHash, { body: JSON.stringify(request), method: 'POST' });
}

export async function stopWorkerMedia(secretHash: string, kind: MediaKind) {
  await callWorker('/nanit/media-stop', secretHash, { body: JSON.stringify({ kind }), method: 'POST' });
}
