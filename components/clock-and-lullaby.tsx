'use client';

import { PauseIcon, PlayIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getLullabiesAction } from '@/app/actions/lullaby';
import { useLullabyAudio } from '@/components/lullaby-audio-provider';

const TICK_MILLISECONDS = 1_000;

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' });

/**
 * The time, and a button for the first lullaby in the list, so the usual track
 * can be started from the switches without walking to the Lullabies tab. The
 * playing itself is `LullabyAudioProvider`'s, so the button and that tab always
 * agree.
 */
export function ClockAndLullaby({ secretHash }: { readonly secretHash: string }) {
  const { currentUrl, isPlaying, lullabies, playTrack, setLullabies } = useLullabyAudio();
  /**
   * Read after mount rather than during render, because the server's clock and
   * time zone are not the phone's and the two would disagree.
   */
  const [time, setTime] = useState<null | string>(null);

  useEffect(() => {
    function tick() {
      setTime(TIME_FORMAT.format(new Date()));
    }

    tick();
    const interval = window.setInterval(tick, TICK_MILLISECONDS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  /**
   * The provider only has the list once the Lullabies tab has been opened, so
   * it is fetched here when this tab is the first one seen.
   */
  useEffect(() => {
    async function load() {
      try {
        setLullabies(await getLullabiesAction(secretHash));
      } catch {
        /**
         * The button stays disabled; the Lullabies tab is where the reason is shown.
         */
      }
    }

    if (lullabies === null) {
      load();
    }
  }, [lullabies, secretHash, setLullabies]);

  const firstLullaby = lullabies?.[0];
  const isSounding = firstLullaby !== undefined && firstLullaby.url === currentUrl && isPlaying;

  return (
    <div className="flex items-center gap-3 px-5">
      <span className="flex-1 text-2xl tabular-nums opacity-70">{time}</span>

      <button
        aria-label={firstLullaby === undefined ? 'No lullaby to play' : `${isSounding ? 'Pause' : 'Play'} ${firstLullaby.name}`}
        className={`shrink-0 rounded-lg border p-2 transition-colors disabled:opacity-60 ${isSounding ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/40'}`}
        disabled={firstLullaby === undefined}
        onClick={() => {
          if (firstLullaby !== undefined) {
            playTrack(firstLullaby.url);
          }
        }}
        type="button"
      >
        {isSounding ? <PauseIcon className="size-6" /> : <PlayIcon className="size-6" />}
      </button>
    </div>
  );
}
