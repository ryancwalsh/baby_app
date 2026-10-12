'use client';

/**
 * A short record of when the noise started and stopped, and what did it.
 *
 * The noise is left running for hours with the app in the background, and when
 * it is found silent there is otherwise nothing to say whether a button, the
 * phone or a reloaded page ended it. Kept in localStorage rather than in
 * memory, because a reload is one of the things being told apart.
 */

const LOG_KEY = 'baby-app-noise-log';
const ALIVE_KEY = 'baby-app-noise-alive-at';
const MAXIMUM_ENTRIES = 30;

const LOG_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit' });

export function formatNoiseLogTime(at: number): string {
  return LOG_TIME_FORMAT.format(at);
}

export type NoiseLogEntry = { at: number; what: string };

export function readNoiseLog(): NoiseLogEntry[] {
  try {
    return JSON.parse(window.localStorage.getItem(LOG_KEY) ?? '[]') as NoiseLogEntry[];
  } catch {
    return [];
  }
}

/**
 * Returns the log as it now stands, newest last.
 */
export function appendToNoiseLog(what: string): NoiseLogEntry[] {
  const log = [...readNoiseLog(), { at: Date.now(), what }].slice(-MAXIMUM_ENTRIES);

  window.localStorage.setItem(LOG_KEY, JSON.stringify(log));

  return log;
}

const BYTES_PER_MEGABYTE = 1_048_576;

/**
 * Chrome's own count of the page's script memory, which no other browser
 * offers. It is recorded because a page that grows until the phone kills it
 * looks, from the outside, exactly like one the phone simply threw away.
 */
function readMegabytes(): null | number {
  const { memory } = performance as unknown as { memory?: { usedJSHeapSize: number } };

  return memory === undefined ? null : Math.round(memory.usedJSHeapSize / BYTES_PER_MEGABYTE);
}

type NoiseAlive = { at: number; megabytes: null | number; megabytesAtStart: null | number };

let megabytesAtStart: null | number = null;
let isMarked = false;

/**
 * Written every few seconds while the noise plays and removed when it stops,
 * so finding one on a fresh page means the last page ended mid-noise.
 */
export function markNoiseAlive(): void {
  const megabytes = readMegabytes();

  if (!isMarked) {
    isMarked = true;
    megabytesAtStart = megabytes;
  }

  const alive: NoiseAlive = { at: Date.now(), megabytes, megabytesAtStart };

  window.localStorage.setItem(ALIVE_KEY, JSON.stringify(alive));
}

export function clearNoiseAlive(): void {
  isMarked = false;
  window.localStorage.removeItem(ALIVE_KEY);
}

export function takeNoiseAlive(): NoiseAlive | null {
  const stored = window.localStorage.getItem(ALIVE_KEY);

  clearNoiseAlive();

  try {
    return stored === null ? null : (JSON.parse(stored) as NoiseAlive);
  } catch {
    return null;
  }
}
