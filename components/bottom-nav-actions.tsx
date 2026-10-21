'use client';

import { LightbulbIcon, NotepadTextIcon, PauseIcon, PlayIcon, Volume2Icon, VolumeIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { getLullabiesAction } from '@/app/actions/lullaby';
import { SECRET_HASH_KEY } from '@/components/login-guard';
import { useLullabyAudio } from '@/components/lullaby-audio-provider';
import { useNanitAudio } from '@/components/nanit-audio-provider';
import { useNoiseAudio } from '@/components/noise-audio-provider';
import { changeNightLight, getWorkerUrl } from '@/components/worker-client';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { TRACKING_VIEWS, useTrackingView } from '@/hooks/use-tracking-view';
import { reportWorkerTrouble, useWorkerStatus } from '@/hooks/use-worker-status';
import { type NightLightState } from '@/services/nanit/night-light';

/**
 * The buttons that sit above the tabs in the bottom navigation, one per tab:
 * the thing most often wanted from that tab, reachable from every other one.
 *
 * The navigation is outside every page's login guard, so each of these reads
 * the stored hash itself and stays disabled until there is one.
 */

/**
 * The margin beneath is dead space on purpose: a thumb reaching for a tab in
 * the dark must not land on something that changes the light or the sound.
 */
function getActionClassName(isActive: boolean) {
  return `mb-3 rounded-lg border p-1.5 transition-colors disabled:opacity-60 ${isActive ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/40'}`;
}

/**
 * A copy of the switch on the night light tile. The two do not share state:
 * each follows the night light stream, which reports every change whichever of
 * them made it, so they agree as soon as the camera has answered.
 *
 * Opening the stream only reads — see app/api/night-light/stream/route.ts. The
 * light is written to by a press and by nothing else.
 */
export function NightLightAction() {
  const { value: secretHash } = useLocalStorage(SECRET_HASH_KEY);
  /**
   * Null until the stream's first frame, so the button never offers to switch
   * a light whose state it has not been told.
   */
  const [isOn, setIsOn] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();
  /**
   * The laptop holds the camera connection, so the button is dead while this phone cannot reach it.
   */
  const isOffline = useWorkerStatus() === 'offline';

  useEffect(() => {
    if (secretHash === null || secretHash === undefined) {
      return undefined;
    }

    const source = new EventSource(getWorkerUrl('/night-light/stream', secretHash));

    source.addEventListener('message', (event) => {
      setIsOn((JSON.parse(event.data) as NightLightState).isOn);
    });
    source.addEventListener('error', reportWorkerTrouble);

    return () => {
      source.close();
    };
  }, [secretHash]);

  const hasSecretHash = secretHash !== null && secretHash !== undefined;

  return (
    <button
      aria-checked={isOn === true}
      aria-label="Nanit night light"
      className={getActionClassName(isOn === true)}
      disabled={!hasSecretHash || isOn === null || isPending || isOffline}
      onClick={() => {
        if (hasSecretHash && isOn !== null) {
          const previous = isOn;
          setIsOn(!previous);

          startTransition(async () => {
            try {
              setIsOn((await changeNightLight(secretHash, { action: 'power', isOn: !previous })).isOn);
            } catch {
              setIsOn(previous);
              reportWorkerTrouble();
            }
          });
        }
      }}
      role="switch"
      type="button"
    >
      <LightbulbIcon className="size-5" />
    </button>
  );
}

/**
 * Two of the Nanit app's three modes: off, and on even in the background.
 * There is no "only while the app is open" here.
 */
export function ListenAction() {
  const { value: secretHash } = useLocalStorage(SECRET_HASH_KEY);
  const { isMonitoring, isStarting, setIsMonitoring } = useNanitAudio();
  /**
   * Listening needs the laptop, so it cannot be started while this phone cannot reach it. Stopping always works.
   */
  const isOffline = useWorkerStatus() === 'offline';

  return (
    <button
      aria-checked={isMonitoring}
      aria-label="Listen to the room"
      className={getActionClassName(isMonitoring)}
      disabled={isStarting || secretHash === null || secretHash === undefined || (isOffline && !isMonitoring)}
      onClick={() => setIsMonitoring(!isMonitoring)}
      role="switch"
      type="button"
    >
      {isMonitoring ? <Volume2Icon className="size-5" /> : <VolumeIcon className="size-5" />}
    </button>
  );
}

/**
 * Plays the first lullaby in the list, so the usual track can be started
 * without walking to the Lullabies tab. The playing itself is
 * `LullabyAudioProvider`'s, so this button and that tab always agree.
 */
export function LullabyAction() {
  const { value: secretHash } = useLocalStorage(SECRET_HASH_KEY);
  const { currentUrl, isPlaying, lullabies, playTrack, setLullabies } = useLullabyAudio();

  /**
   * The provider only has the list once the Lullabies tab has been opened, so
   * it is fetched here when another tab is the first one seen.
   */
  useEffect(() => {
    async function load(hash: string) {
      try {
        setLullabies(await getLullabiesAction(hash));
      } catch {
        /**
         * The button stays disabled; the Lullabies tab is where the reason is shown.
         */
      }
    }

    if (lullabies === null && secretHash !== null && secretHash !== undefined) {
      load(secretHash);
    }
  }, [lullabies, secretHash, setLullabies]);

  const firstLullaby = lullabies?.[0];
  const isSounding = firstLullaby !== undefined && firstLullaby.url === currentUrl && isPlaying;

  return (
    <button
      aria-label={firstLullaby === undefined ? 'No lullaby to play' : `${isSounding ? 'Pause' : 'Play'} ${firstLullaby.name}`}
      className={getActionClassName(isSounding)}
      disabled={firstLullaby === undefined}
      onClick={() => {
        if (firstLullaby !== undefined) {
          playTrack(firstLullaby.url);
        }
      }}
      type="button"
    >
      {isSounding ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
    </button>
  );
}

export function NoiseAction() {
  const { isPlaying, togglePlay } = useNoiseAudio();

  return (
    <button
      aria-label={isPlaying ? 'Pause the noise' : 'Play the noise'}
      className={getActionClassName(isPlaying)}
      onClick={async () => {
        await togglePlay();
      }}
      type="button"
    >
      {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
    </button>
  );
}

/**
 * The one action that is a page rather than a switch: the log of everything tracked, as the day calendar or the tracking list, whichever this phone's settings choose. It changes nothing, so unlike the others it needs no login to show.
 */
export function TrackingAction() {
  const pathname = usePathname();
  const { trackingViewHref } = useTrackingView();
  const isActive = TRACKING_VIEWS.some(({ href }) => href === pathname);

  return (
    <Link aria-label="Tracking log" className={getActionClassName(isActive)} href={trackingViewHref}>
      <NotepadTextIcon className="size-5" />
    </Link>
  );
}
