'use client';

import { BellIcon, BellOffIcon, SquareIcon, TriangleAlertIcon, Volume2Icon, WifiIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { getIsIos } from '@/components/platform';
import { formatDuration } from '@/components/tracking-format';
import { soundAlarm, unlockAlarm } from '@/components/webcam-alarm';
import { playWithSound } from '@/components/webcam-media';
import { WebcamWatchPicture } from '@/components/webcam-watch-picture';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { useWebcamWatch } from '@/hooks/use-webcam-watch';

/**
 * This phone watching and listening to the camera phone.
 *
 * The one thing it must never do is look fine while showing nothing. A frozen
 * last frame of a sleeping baby is indistinguishable from a sleeping baby, so
 * what has arrived is counted every second, and a picture or sound that has
 * stopped is reported and — unless switched off — sounded.
 */

const ALARM_SETTING_KEY = 'baby-app-webcam-alarm';
const ALARM_OFF = 'off';

export function WebcamWatch({ onExit, secretHash }: { readonly onExit: () => void; readonly secretHash: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsTapForSound, setNeedsTapForSound] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [hasTriedDirectConnection, setHasTriedDirectConnection] = useState(false);
  const [directConnectionError, setDirectConnectionError] = useState<null | string>(null);
  const isWakeLockHeld = useWakeLock(true);
  const { store: storeAlarmSetting, value: alarmSetting } = useLocalStorage(ALARM_SETTING_KEY);
  const isAlarmOn = alarmSetting !== ALARM_OFF;
  const { askForOffer, diagnostics, dismissUnmonitored, isAlarmAudible, lost, status, unmonitoredMilliseconds } = useWebcamWatch({
    isAlarmOn,
    onStream: () => {
      play();
    },
    secretHash,
    videoRef,
  });

  useEffect(() => {
    setIsIos(getIsIos());
  }, []);

  async function play() {
    const video = videoRef.current;

    if (video !== null) {
      setNeedsTapForSound(!(await playWithSound(video)));
    }
  }

  /**
   * Chrome hides this phone's address on the wifi until the page has microphone permission, and a same-wifi connection can depend on that address. Having the permission is enough, so the microphone is let go of at once.
   */
  async function tryDirectConnection() {
    setHasTriedDirectConnection(true);

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });

      for (const track of stream.getTracks()) {
        track.stop();
      }

      setDirectConnectionError(null);
      askForOffer();
    } catch {
      setDirectConnectionError('The microphone was not allowed, so a direct connection could not be tried.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <WebcamWatchPicture lost={lost} status={status} videoRef={videoRef} />

      {needsTapForSound && (
        <button
          className="flex items-center justify-center gap-2 rounded-2xl border border-accent/40 px-5 py-3 text-accent"
          onClick={() => {
            unlockAlarm();
            play();
          }}
          type="button"
        >
          <Volume2Icon aria-hidden className="size-5" /> Tap to hear the room
        </button>
      )}

      {isAlarmOn && !isAlarmAudible && (
        <button className="flex items-center justify-center gap-2 rounded-2xl border border-accent/40 px-5 py-3 text-accent" onClick={unlockAlarm} type="button">
          <BellOffIcon aria-hidden className="size-5" /> Alarm cannot sound. Tap to enable.
        </button>
      )}

      {status === 'failed' && !isIos && !hasTriedDirectConnection && (
        <div className="flex flex-col gap-2">
          <button
            className="flex items-center justify-center gap-2 rounded-2xl border border-accent/40 px-5 py-3 text-accent"
            onClick={() => {
              tryDirectConnection();
            }}
            type="button"
          >
            <WifiIcon aria-hidden className="size-5" /> Try a direct wifi connection
          </button>
          <p className="text-faint text-xs">
            This asks once for the microphone, because Chrome hides this phone’s wifi address without that permission. Nothing is recorded or sent.
          </p>
        </div>
      )}

      {directConnectionError !== null && <p className="text-sm text-accent">{directConnectionError}</p>}

      {unmonitoredMilliseconds !== null && (
        <div className="flex items-center gap-2 rounded-2xl border border-accent/40 px-4 py-3">
          <p className="flex-1 text-sm text-accent">Not monitored for {formatDuration(unmonitoredMilliseconds)} while this page was frozen, so nothing could have sounded.</p>
          <button className="text-muted text-sm" onClick={dismissUnmonitored} type="button">
            Dismiss
          </button>
        </div>
      )}

      <p className="text-faint text-sm">{status === 'live' && lost === null ? '● Live' : ''}</p>

      {!isWakeLockHeld && (
        <p className="flex gap-2 text-sm text-accent">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          The screen may lock, and a locked phone cannot sound the alarm. Set the screen timeout to Never in this phone/tablet’s display settings.
        </p>
      )}

      {isIos && <p className="text-faint text-xs">On iPhone, a locked screen stops this page: no picture, no sound, and no alarm. Keep the screen on and this app open.</p>}

      <div className="flex gap-2">
        <button
          aria-checked={isAlarmOn}
          className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm ${isAlarmOn ? 'border-accent/60 text-accent' : 'border-foreground/15 opacity-70'}`}
          onClick={() => {
            storeAlarmSetting(isAlarmOn ? ALARM_OFF : null);
          }}
          role="switch"
          type="button"
        >
          {isAlarmOn ? <BellIcon aria-hidden className="size-4" /> : <BellOffIcon aria-hidden className="size-4" />}
          {isAlarmOn ? 'Alerts are on' : 'Alerts are off'}
        </button>
        <button
          className="border-foreground/15 flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm opacity-70"
          onClick={() => {
            unlockAlarm();
            soundAlarm();
          }}
          type="button"
        >
          <Volume2Icon aria-hidden className="size-4" /> Test alarm
        </button>
        <button className="border-foreground/15 flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm opacity-70" onClick={onExit} type="button">
          <SquareIcon aria-hidden className="size-4" /> Stop watching
        </button>
      </div>

      <p className="text-faint text-xs tabular-nums" data-testid="webcam-diagnostics">
        {diagnostics}
      </p>
    </div>
  );
}
