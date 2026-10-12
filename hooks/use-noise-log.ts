'use client';

import { type RefObject, useCallback, useEffect, useState } from 'react';

import { appendToNoiseLog, clearNoiseAlive, formatNoiseLogTime, markNoiseAlive, type NoiseLogEntry, readNoiseLog, takeNoiseAlive } from '@/components/noise-log';

const ALIVE_MARK_MILLISECONDS = 10_000;

/**
 * Keeps the noise log for `NoiseAudioProvider`: hands back `record` for the
 * things the provider does itself, and notes the two it cannot see from
 * inside a toggle — the page having been reloaded mid-noise, and the app
 * leaving and returning to the screen.
 */
export function useNoiseLog(isPlaying: boolean, audioRef: RefObject<HTMLAudioElement | null>) {
  const [log, setLog] = useState<NoiseLogEntry[]>([]);

  const record = useCallback((what: string) => {
    setLog(appendToNoiseLog(what));
  }, []);

  /**
   * A mark left behind by the last page means it ended while the noise was
   * playing: reloaded, or thrown away by the phone in the background. Nothing
   * on that page lived to say so, so this one says it.
   */
  useEffect(() => {
    const lastAliveAt = takeNoiseAlive();

    if (lastAliveAt !== null) {
      appendToNoiseLog(`The page was reloaded while the noise was playing (last alive ${formatNoiseLogTime(lastAliveAt)})`);
    }

    setLog(readNoiseLog());
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      clearNoiseAlive();

      return undefined;
    }

    markNoiseAlive();
    const interval = setInterval(markNoiseAlive, ALIVE_MARK_MILLISECONDS);

    return () => {
      clearInterval(interval);
    };
  }, [isPlaying]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (audioRef.current?.paused === false) {
        record(document.visibilityState === 'visible' ? 'The app came back to the screen' : 'The app went to the background');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [audioRef, record]);

  return { log, record };
}
