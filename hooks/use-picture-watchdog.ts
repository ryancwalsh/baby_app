'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { soundAlarm, unlockAlarm } from '@/components/webcam-alarm';
import { useLocalStorage } from '@/hooks/use-local-storage';

/**
 * Whether the Nanit's picture is actually moving.
 *
 * A frozen last frame of a sleeping baby is indistinguishable from a sleeping
 * baby, and the player cannot be trusted to say when it has stopped: a playlist
 * that stops growing is not an error to hls.js, it simply waits on the last
 * frame. So the picture itself is checked every second, and a picture that has
 * stopped is reported as lost, retried for as long as the switch is on, and —
 * unless switched off — sounded.
 */

const WATCHDOG_MILLISECONDS = 1_000;
/**
 * How long the picture may stand still before it counts as lost. Segments are
 * two seconds long and the player keeps several in hand, so an ordinary live
 * picture never stops this long.
 */
const STALE_AFTER_MILLISECONDS = 5_000;
/**
 * How often to attach the stream afresh while the picture is lost. It keeps
 * trying for as long as the switch is on: a phone left watching overnight has
 * nobody holding it to switch it back on.
 */
const RETRY_MILLISECONDS = 10_000;
/**
 * How long the picture may be lost before the phone sounds. Longer than the
 * cover, because the relay picks up a fresh stream about once an hour — the
 * camera's link only lasts that long — and that gap is normally over within
 * this time. A picture still gone after it is not coming back by itself.
 */
const ALARM_AFTER_MILLISECONDS = 30_000;
const ALARM_REPEAT_MILLISECONDS = 2_000;
const ALARM_SETTING_KEY = 'baby-app-nanit-alarm';
const ALARM_OFF = 'off';

export function usePictureWatchdog({
  isStarting,
  isWatching,
  retry,
  videoRef,
}: {
  /**
   * Not judged while starting, which takes seconds from cold.
   */
  readonly isStarting: boolean;
  readonly isWatching: boolean;
  /**
   * Attaches the stream afresh. Must be stable across renders.
   */
  readonly retry: () => void;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [isStale, setIsStale] = useState(false);
  /**
   * Read by the caller's start, which must not switch the picture off when it
   * is one of these retries that failed.
   */
  const isStaleRef = useRef(false);
  /**
   * When the picture was last seen moving before it was lost. Kept across the
   * retries, each of which starts the watchdog over.
   */
  const lostSinceRef = useRef<null | number>(null);
  const { store: storeAlarmSetting, value: alarmSetting } = useLocalStorage(ALARM_SETTING_KEY);
  const isAlarmOn = alarmSetting !== ALARM_OFF;
  const isAlarmOnRef = useRef(isAlarmOn);

  useEffect(() => {
    isAlarmOnRef.current = isAlarmOn;
  }, [isAlarmOn]);

  const markStale = useCallback((isNowStale: boolean, lastProgressAt: number) => {
    isStaleRef.current = isNowStale;
    lostSinceRef.current = isNowStale ? (lostSinceRef.current ?? lastProgressAt) : null;
    setIsStale(isNowStale);
  }, []);

  /**
   * Not judged while the page is hidden either, where the browser pauses the
   * picture on purpose.
   */
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isWatching && !isStarting) {
      /**
       * Taken from the element rather than assumed, so that a retry which
       * attached nothing does not count as the picture coming back.
       */
      let lastTime = videoRef.current?.currentTime ?? 0;
      let lastProgressAt = Date.now();
      let lastRetryAt = Date.now();

      interval = setInterval(() => {
        const video = videoRef.current;
        const now = Date.now();

        if (video === null || document.visibilityState !== 'visible') {
          lastProgressAt = now;
        } else if (video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          lastProgressAt = now;
          markStale(false, now);
        } else if (now - lastProgressAt > STALE_AFTER_MILLISECONDS) {
          markStale(true, lastProgressAt);

          if (now - lastRetryAt > RETRY_MILLISECONDS) {
            lastRetryAt = now;
            retry();
          } else if (video.paused) {
            // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget: the next tick tries again.
            video.play().catch(() => {});
          }
        }
      }, WATCHDOG_MILLISECONDS);
    }

    return () => {
      if (interval !== null) {
        clearInterval(interval);
      }
    };
  }, [isStarting, isWatching, markStale, retry, videoRef]);

  /**
   * Seen is not enough when nobody is looking, so a picture that stays lost is
   * also heard. Separate from the watchdog, which stands down during each
   * retry — and a retry that cannot reach the camera takes the better part of
   * half a minute.
   */
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isWatching && isStale) {
      interval = setInterval(() => {
        const lostSince = lostSinceRef.current;

        if (isAlarmOnRef.current && lostSince !== null && Date.now() - lostSince > ALARM_AFTER_MILLISECONDS) {
          soundAlarm();
        }
      }, ALARM_REPEAT_MILLISECONDS);
    }

    return () => {
      if (interval !== null) {
        clearInterval(interval);
      }
    };
  }, [isStale, isWatching]);

  useEffect(() => {
    if (!isWatching) {
      markStale(false, Date.now());
    }
  }, [isWatching, markStale]);

  const toggleAlarm = useCallback(() => {
    unlockAlarm();
    storeAlarmSetting(isAlarmOn ? ALARM_OFF : null);
  }, [isAlarmOn, storeAlarmSetting]);

  return { isAlarmOn, isStale, isStaleRef, toggleAlarm };
}
