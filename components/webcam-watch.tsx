'use client';

import { BellIcon, BellOffIcon, SquareIcon, Volume2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { sendWebcamSignalAction } from '@/app/actions/webcam';
import { getIsIos } from '@/components/platform';
import { soundAlarm, unlockAlarm } from '@/components/webcam-alarm';
import { getLocalDescription, ICE_SERVERS, openWebcamStream, waitForIceGathering } from '@/components/webcam-connection';
import { playWithSound } from '@/components/webcam-media';
import { type Status, WebcamWatchPicture } from '@/components/webcam-watch-picture';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { CAMERA_ADDRESS, type WebcamServerMessage } from '@/services/webcam/messages';

/**
 * This phone watching and listening to the camera phone.
 *
 * The one thing it must never do is look fine while showing nothing. A frozen
 * last frame of a sleeping baby is indistinguishable from a sleeping baby, so
 * the picture is checked every second for actually moving, and a picture that
 * has stopped is covered over and — unless switched off — sounded.
 */

const ALARM_SETTING_KEY = 'baby-app-webcam-alarm';
const ALARM_OFF = 'off';
const WATCHDOG_MILLISECONDS = 1_000;
/**
 * How long the picture may stand still before it counts as lost. The camera
 * sends 15 frames a second, so this is far past any ordinary hiccup.
 */
const STALE_AFTER_MILLISECONDS = 5_000;
const ALARM_REPEAT_MILLISECONDS = 2_000;
/**
 * How often to ask the camera for a fresh offer while nothing is arriving.
 * This is the whole of the recovery: a phone that changed networks, or a
 * camera that restarted, answers with a new connection.
 */
const RETRY_MILLISECONDS = 10_000;

export function WebcamWatch({ onExit, secretHash }: { readonly onExit: () => void; readonly secretHash: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('waiting');
  const [isStale, setIsStale] = useState(false);
  const [needsTapForSound, setNeedsTapForSound] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const { store: storeAlarmSetting, value: alarmSetting } = useLocalStorage(ALARM_SETTING_KEY);
  const isAlarmOn = alarmSetting !== ALARM_OFF;
  /**
   * Read by the watchdog's interval, which is set up once and would otherwise
   * only ever see the first render's values.
   */
  const isAlarmOnRef = useRef(isAlarmOn);
  const statusRef = useRef<Status>('waiting');

  useEffect(() => {
    isAlarmOnRef.current = isAlarmOn;
  }, [isAlarmOn]);

  useEffect(() => {
    setIsIos(getIsIos());
  }, []);

  async function play() {
    const video = videoRef.current;

    if (video !== null) {
      setNeedsTapForSound(!(await playWithSound(video)));
    }
  }

  useEffect(() => {
    const clientId = window.crypto.randomUUID();
    let connection: null | RTCPeerConnection = null;
    let cameraId: null | string = null;
    let isCameraRunning = false;
    let hasEverBeenLive = false;
    let lastTime = -1;
    let lastProgressAt = Date.now();
    let lastRetryAt = Date.now();
    let lastAlarmAt = 0;

    function setWatchStatus(next: Status) {
      statusRef.current = next;
      setStatus(next);
    }

    function hangUp() {
      connection?.close();
      connection = null;

      if (videoRef.current !== null) {
        videoRef.current.srcObject = null;
      }
    }

    function askForOffer() {
      lastRetryAt = Date.now();
      // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget: the watchdog asks again if this is lost.
      sendWebcamSignalAction(secretHash, { from: clientId, to: CAMERA_ADDRESS, type: 'hello' }).catch(() => {});
    }

    async function answer(from: string, description: RTCSessionDescriptionInit) {
      hangUp();

      const next = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      connection = next;
      cameraId = from;
      setWatchStatus('connecting');

      next.addEventListener('track', (event) => {
        const [stream] = event.streams;

        if (videoRef.current !== null && stream !== undefined && videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
          play();
        }
      });

      next.addEventListener('connectionstatechange', () => {
        if (connection === next) {
          if (next.connectionState === 'connected') {
            hasEverBeenLive = true;
            setWatchStatus('live');
          } else if (next.connectionState === 'failed' && !hasEverBeenLive) {
            /**
             * Never connected at all, which with no relay server usually means
             * a network that keeps its devices apart.
             */
            setWatchStatus('failed');
          }
        }
      });

      try {
        await next.setRemoteDescription(description);
        await next.setLocalDescription();
        await waitForIceGathering(next);

        if (connection === next) {
          await sendWebcamSignalAction(secretHash, { description: getLocalDescription(next), from: clientId, to: from, type: 'answer' });
        }
      } catch {
        /**
         * The watchdog asks for a fresh offer.
         */
      }
    }

    function handleMessage(message: WebcamServerMessage) {
      if (message.type === 'camera') {
        isCameraRunning = message.startedAt !== null;

        if (!isCameraRunning && connection === null && statusRef.current !== 'stopped') {
          setWatchStatus('waiting');
        }
      } else if (message.type === 'signal') {
        const { description, from, type } = message.signal;

        if (type === 'offer' && description !== undefined) {
          answer(from, description);
        } else if (type === 'bye' && from === cameraId) {
          /**
           * Stopped on purpose, which is not an emergency.
           */
          hangUp();
          hasEverBeenLive = false;
          setWatchStatus('stopped');
        }
      }
    }

    const source = openWebcamStream(secretHash, 'watcher', clientId, handleMessage);

    /**
     * Frames moving is the only evidence worth trusting. Connection states lag,
     * and a camera phone that has locked its screen can stay "connected" while
     * sending nothing at all.
     */
    const watchdog = setInterval(() => {
      const video = videoRef.current;
      const now = Date.now();

      if (video !== null && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastProgressAt = now;
      }

      const isLost = hasEverBeenLive && statusRef.current !== 'stopped' && now - lastProgressAt > STALE_AFTER_MILLISECONDS;

      setIsStale(isLost);

      if (isLost && isAlarmOnRef.current && now - lastAlarmAt > ALARM_REPEAT_MILLISECONDS) {
        lastAlarmAt = now;
        soundAlarm();
      }

      if (isCameraRunning && now - lastProgressAt > STALE_AFTER_MILLISECONDS && now - lastRetryAt > RETRY_MILLISECONDS) {
        askForOffer();
      }
    }, WATCHDOG_MILLISECONDS);

    return () => {
      clearInterval(watchdog);
      source.close();

      if (connection !== null && cameraId !== null) {
        // eslint-disable-next-line promise/prefer-await-to-then -- Cleanup is synchronous; the camera notices on its own if this is lost.
        sendWebcamSignalAction(secretHash, { from: clientId, to: cameraId, type: 'bye' }).catch(() => {});
      }

      hangUp();
    };
  }, [secretHash]);

  return (
    <div className="flex flex-col gap-3">
      <WebcamWatchPicture isStale={isStale} status={status} videoRef={videoRef} />

      {needsTapForSound && (
        <button
          className="flex items-center justify-center gap-2 rounded-2xl border border-amber-500/40 px-5 py-3 text-amber-500"
          onClick={() => {
            unlockAlarm();
            play();
          }}
          type="button"
        >
          <Volume2Icon aria-hidden className="size-5" /> Tap to hear the room
        </button>
      )}

      <p className="text-foreground/50 text-sm">{status === 'live' && !isStale ? '● Live' : ''}</p>

      {isIos && <p className="text-foreground/40 text-xs">On iPhone, sound may stop when the screen locks. Keep the screen on to be sure.</p>}

      <div className="flex gap-2">
        <button
          aria-checked={isAlarmOn}
          className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm ${isAlarmOn ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 opacity-70'}`}
          onClick={() => {
            storeAlarmSetting(isAlarmOn ? ALARM_OFF : null);
          }}
          role="switch"
          type="button"
        >
          {isAlarmOn ? <BellIcon aria-hidden className="size-4" /> : <BellOffIcon aria-hidden className="size-4" />}
          {isAlarmOn ? 'Alerts are on' : 'Alerts are off'}
        </button>
        <button className="border-foreground/15 flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm opacity-70" onClick={onExit} type="button">
          <SquareIcon aria-hidden className="size-4" /> Stop watching
        </button>
      </div>
    </div>
  );
}
