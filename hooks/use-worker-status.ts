'use client';

import { useSyncExternalStore } from 'react';

import { getWorkerHealthUrl } from '@/components/worker-client';

/**
 * Whether this phone can reach the worker right now. Asked by the phone itself, not by the server on its behalf, because what matters is this phone's path through the tunnel: a worker that is up behind a dead tunnel is as offline as one that is down.
 *
 * One check is shared by every component on the page. It runs every 30 seconds while the page is visible, at once when the page becomes visible, and whenever a component reports trouble reaching the worker. It only ever reads.
 */

export type WorkerStatus = 'checking' | 'offline' | 'online';

const CHECK_MILLISECONDS = 30_000;
const TIMEOUT_MILLISECONDS = 2_000;

let status: WorkerStatus = 'checking';
let timer: null | number = null;
let isChecking = false;
const listeners = new Set<() => void>();

function setStatus(next: WorkerStatus) {
  if (next !== status) {
    status = next;
    for (const listener of listeners) {
      listener();
    }
  }
}

async function check() {
  if (!isChecking) {
    isChecking = true;
    try {
      const response = await fetch(getWorkerHealthUrl(), { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS) });
      setStatus(response.ok ? 'online' : 'offline');
    } catch {
      setStatus('offline');
    } finally {
      // eslint-disable-next-line require-atomic-updates -- Only this function sets it, and only after its own check has finished.
      isChecking = false;
    }
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    check();
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  if (listeners.size === 1) {
    check();
    timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        check();
      }
    }, CHECK_MILLISECONDS);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

/**
 * For a stream that dropped or a call that failed: check now rather than at the next tick, so the page dims straight away.
 */
export function reportWorkerTrouble() {
  check();
}

export function useWorkerStatus(): WorkerStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => 'checking',
  );
}
