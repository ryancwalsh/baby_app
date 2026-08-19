'use client';

import { MusicIcon, PauseIcon, PlayIcon, RepeatIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type Lullaby } from '@/app/actions/lullaby';

const CARD_CLASS_NAME = 'border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4';

/**
 * A single `<audio>` element reused across tracks rather than one per track:
 * only one lullaby ever plays, and a shared element keeps looping and pausing
 * in one place.
 */
export function LullabyPlayer({ lullabies }: { readonly lullabies: Lullaby[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentUrl, setCurrentUrl] = useState<null | string>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

  /**
   * `loop` is a property rather than an attribute, so it is set imperatively.
   */
  useEffect(() => {
    if (audioRef.current !== null) {
      audioRef.current.loop = isLooping;
    }
  }, [isLooping]);

  function playTrack(url: string) {
    const audio = audioRef.current;

    if (audio !== null) {
      if (url === currentUrl) {
        if (isPlaying) {
          audio.pause();
        } else {
          void audio.play();
        }
      } else {
        setCurrentUrl(url);
        audio.src = url;
        void audio.play();
      }
    }
  }

  const currentLullaby = lullabies.find((lullaby) => lullaby.url === currentUrl);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-foreground/60 flex items-center gap-2 text-lg font-semibold">
        <MusicIcon className="size-5 opacity-60" />
        Lullabies
      </h2>

      {lullabies.length === 0 ? (
        <p className={`${CARD_CLASS_NAME} text-sm opacity-70`}>No mp3 files yet. Add some to public/lullabies.</p>
      ) : (
        <div className={`${CARD_CLASS_NAME} flex flex-col gap-3`}>
          <div className="flex items-center justify-between gap-4">
            <span className="flex-1 text-sm opacity-70">{currentLullaby === undefined ? 'Nothing playing' : currentLullaby.name}</span>
            <button
              aria-label="Repeat the current lullaby"
              aria-pressed={isLooping}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isLooping ? 'border-amber-500/60 font-semibold text-amber-500' : 'border-foreground/15'}`}
              onClick={() => setIsLooping(!isLooping)}
              type="button"
            >
              <RepeatIcon className="size-4" />
              Loop
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {lullabies.map((lullaby) => {
              const isCurrent = lullaby.url === currentUrl;

              return (
                <button
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm ${isCurrent ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15'}`}
                  key={lullaby.url}
                  onClick={() => playTrack(lullaby.url)}
                  type="button"
                >
                  {isCurrent && isPlaying ? <PauseIcon className="size-4 shrink-0" /> : <PlayIcon className="size-4 shrink-0" />}
                  <span className="flex-1">{lullaby.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <audio onEnded={() => setIsPlaying(false)} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} ref={audioRef} />
    </section>
  );
}
