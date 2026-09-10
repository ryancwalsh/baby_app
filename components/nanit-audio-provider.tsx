'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { stopNanitMediaAction } from '@/app/actions/nanit-media';
import { attachHlsStream, type HlsPlayer } from '@/components/hls-playback';
import { SECRET_HASH_KEY } from '@/components/login-guard';
import { useLocalStorage } from '@/hooks/use-local-storage';

/**
 * Listening to the nursery, the "on all the time" way.
 *
 * The Nanit app offers three modes — off, on while the app is open, and on in
 * the background too. Only the two ends are wired up here, so the button is a
 * plain on/off and "on" always means the background kind: this provider sits
 * above the router, so the sound outlives a tab change, a locked screen and a
 * backgrounded app, exactly as the lullaby and noise providers do.
 *
 * The relay has no separate start call. Playing the playlist is what starts it,
 * and the segment requests a playing phone makes are what keep it alive — see
 * services/nanit/media.ts.
 */

const PLAYLIST_PATH = '/api/nanit/media/audio.m3u8';
/**
 * How long to wait before picking the stream back up after a network error. A
 * monitor that quietly gave up at 3am would be worse than useless.
 */
const RETRY_DELAY_MILLISECONDS = 3_000;

type NanitAudio = {
  error: null | string;
  isMonitoring: boolean;
  isStarting: boolean;
  setIsMonitoring: (isMonitoring: boolean) => void;
};

const NanitAudioContext = createContext<NanitAudio | null>(null);

export function useNanitAudio() {
  const audio = useContext(NanitAudioContext);

  if (audio === null) {
    throw new Error('useNanitAudio needs a NanitAudioProvider above it.');
  }

  return audio;
}

export function NanitAudioProvider({ children }: { readonly children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  /**
   * The hls.js instance, when one is in use — null when the browser is playing
   * the stream itself and there is nothing to tear down.
   */
  const hlsRef = useRef<HlsPlayer | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const { value: secretHash } = useLocalStorage(SECRET_HASH_KEY);

  const detach = useCallback(() => {
    const audio = audioRef.current;

    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (hlsRef.current !== null) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (audio !== null) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }, []);

  const attach = useCallback(async (url: string) => {
    const audio = audioRef.current;

    if (audio !== null) {
      hlsRef.current = await attachHlsStream(audio, url);
      await audio.play();
    }
  }, []);

  /**
   * Everything that actually starts or stops the sound lives here, driven by
   * the toggle, so there is one place where the two can get out of step.
   */
  useEffect(() => {
    let isCurrent = true;

    if (isMonitoring && secretHash !== null && secretHash !== undefined) {
      const url = `${PLAYLIST_PATH}?secretHash=${encodeURIComponent(secretHash)}`;

      setIsStarting(true);
      setError(null);

      /**
       * The first playlist can take a few seconds: the camera has to be told to
       * stream before there is anything to hand over.
       */
      const start = async () => {
        try {
          await attach(url);

          if (isCurrent) {
            setIsStarting(false);
          }
        } catch {
          if (isCurrent) {
            setIsStarting(false);
            setError('Could not reach the camera.');
            setIsMonitoring(false);
          }
        }
      };

      start();
    }

    return () => {
      isCurrent = false;
    };
  }, [attach, isMonitoring, secretHash]);

  /**
   * Turning it off is the one direction that has to reach the server: the relay
   * would otherwise keep the camera streaming until it noticed nobody asking.
   */
  useEffect(() => {
    if (!isMonitoring) {
      detach();

      if (secretHash !== null && secretHash !== undefined) {
        const stop = async () => {
          try {
            await stopNanitMediaAction(secretHash, 'audio');
          } catch {
            /**
             * The sound has already stopped on this phone, which is what the
             * press asked for. A camera left streaming falls away on its own.
             */
          }
        };

        stop();
      }
    }
  }, [detach, isMonitoring, secretHash]);

  /**
   * A dropped segment or a sleeping radio should not end the night's
   * monitoring, so a failure while still switched on reloads rather than stops.
   * hls.js does its own recovery, so this only covers the native path.
   */
  function handleError() {
    const audio = audioRef.current;

    if (isMonitoring && hlsRef.current === null && audio !== null && retryTimerRef.current === null) {
      retryTimerRef.current = setTimeout(async () => {
        retryTimerRef.current = null;
        audio.load();

        try {
          await audio.play();
        } catch {
          /**
           * Another error event schedules the next attempt, so a camera that is
           * still away is simply tried again.
           */
        }
      }, RETRY_DELAY_MILLISECONDS);
    }
  }

  const value = useMemo(() => ({ error, isMonitoring, isStarting, setIsMonitoring }), [error, isMonitoring, isStarting]);

  return (
    <NanitAudioContext value={value}>
      <audio onError={handleError} ref={audioRef} />
      {children}
    </NanitAudioContext>
  );
}
