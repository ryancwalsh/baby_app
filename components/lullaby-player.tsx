'use client';

import { MusicIcon, PauseIcon, PlayIcon, Repeat1Icon, RepeatIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type Lullaby } from '@/app/actions/lullaby';

const CARD_CLASS_NAME = 'border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4';

const LOOP_MODE_STORAGE_KEY = 'lullaby-loop-mode';

/**
 * `one` repeats the current lullaby, `all` walks the list and wraps, `off`
 * stops at the end of the track.
 */
type LoopMode = 'all' | 'off' | 'one';

const LOOP_MODES: Record<LoopMode, { icon: typeof RepeatIcon; label: string }> = {
  all: { icon: RepeatIcon, label: 'Loop all' },
  off: { icon: RepeatIcon, label: 'Loop off' },
  one: { icon: Repeat1Icon, label: 'Loop 1' },
};

const NEXT_LOOP_MODE: Record<LoopMode, LoopMode> = {
  all: 'off',
  off: 'one',
  one: 'all',
};

const DEFAULT_LOOP_MODE: LoopMode = 'one';

function isLoopMode(value: null | string): value is LoopMode {
  return value !== null && Object.keys(LOOP_MODES).includes(value);
}

/**
 * A single `<audio>` element reused across tracks rather than one per track:
 * only one lullaby ever plays, and a shared element keeps looping and pausing
 * in one place.
 */
export function LullabyPlayer({ lullabies }: { readonly lullabies: Lullaby[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentUrl, setCurrentUrl] = useState<null | string>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>(DEFAULT_LOOP_MODE);

  /**
   * The stored mode is read after mount rather than during render, because the
   * server has no localStorage and the two would disagree.
   */
  useEffect(() => {
    const storedMode = window.localStorage.getItem(LOOP_MODE_STORAGE_KEY);

    if (isLoopMode(storedMode)) {
      setLoopMode(storedMode);
    }
  }, []);

  /**
   * `loop` is a property rather than an attribute, so it is set imperatively.
   * Looping the whole list is done by hand when a track ends.
   */
  useEffect(() => {
    if (audioRef.current !== null) {
      audioRef.current.loop = loopMode === 'one';
    }
  }, [loopMode]);

  /**
   * With a single lullaby, looping the list and looping the track are the same
   * thing, so `all` is stepped over.
   */
  function getNextLoopMode(mode: LoopMode) {
    const nextMode = NEXT_LOOP_MODE[mode];

    return lullabies.length === 1 && nextMode === 'all' ? NEXT_LOOP_MODE[nextMode] : nextMode;
  }

  function cycleLoopMode() {
    const nextMode = getNextLoopMode(loopMode);

    setLoopMode(nextMode);
    window.localStorage.setItem(LOOP_MODE_STORAGE_KEY, nextMode);
  }

  function startTrack(url: string) {
    const audio = audioRef.current;

    if (audio !== null) {
      setCurrentUrl(url);
      audio.src = url;
      void audio.play();
    }
  }

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
        startTrack(url);
      }
    }
  }

  function handleEnded() {
    const currentIndex = lullabies.findIndex((lullaby) => lullaby.url === currentUrl);
    const nextLullaby = lullabies[(currentIndex + 1) % lullabies.length];

    if (loopMode === 'all' && currentIndex !== -1 && nextLullaby !== undefined) {
      startTrack(nextLullaby.url);
    } else {
      setIsPlaying(false);
    }
  }

  const currentLullaby = lullabies.find((lullaby) => lullaby.url === currentUrl);
  const LoopIcon = LOOP_MODES[loopMode].icon;

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
              aria-label={`${LOOP_MODES[loopMode].label}. Switch to ${LOOP_MODES[getNextLoopMode(loopMode)].label}.`}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${loopMode === 'off' ? 'border-foreground/15' : 'border-amber-500/60 font-semibold text-amber-500'}`}
              onClick={() => cycleLoopMode()}
              type="button"
            >
              <LoopIcon className="size-4" />
              {LOOP_MODES[loopMode].label}
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

      <audio onEnded={() => handleEnded()} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} ref={audioRef} />
    </section>
  );
}
