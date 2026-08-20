'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { type Lullaby } from '@/app/actions/lullaby';

const LOOP_MODE_STORAGE_KEY = 'lullaby-loop-mode';

/**
 * `one` repeats the current lullaby, `all` walks the list and wraps, `off`
 * stops at the end of the track.
 */
export type LoopMode = 'all' | 'off' | 'one';

const NEXT_LOOP_MODE: Record<LoopMode, LoopMode> = {
  all: 'off',
  off: 'one',
  one: 'all',
};

const DEFAULT_LOOP_MODE: LoopMode = 'one';

function isLoopMode(value: null | string): value is LoopMode {
  return value !== null && Object.keys(NEXT_LOOP_MODE).includes(value);
}

/**
 * With a single lullaby, looping the list and looping the track are the same
 * thing, so `all` is stepped over.
 */
function getNextLoopMode(mode: LoopMode, lullabyCount: number) {
  const nextMode = NEXT_LOOP_MODE[mode];

  return lullabyCount === 1 && nextMode === 'all' ? NEXT_LOOP_MODE[nextMode] : nextMode;
}

type LullabyAudio = {
  currentUrl: null | string;
  cycleLoopMode: () => void;
  isPlaying: boolean;
  loopMode: LoopMode;
  lullabies: Lullaby[] | null;
  nextLoopMode: LoopMode;
  playTrack: (url: string) => void;
  setLullabies: (lullabies: Lullaby[]) => void;
};

const LullabyAudioContext = createContext<LullabyAudio | null>(null);

export function useLullabyAudio() {
  const audio = useContext(LullabyAudioContext);

  if (audio === null) {
    throw new Error('useLullabyAudio needs a LullabyAudioProvider above it.');
  }

  return audio;
}

/**
 * The playing half of the lullabies lives here, above the router, so a track
 * keeps playing while another tab is on screen. This is mounted once by the
 * root layout; the player UI under `/lullabies` unmounts on navigation and the
 * sound would go with it.
 *
 * A single `<audio>` element is reused across tracks rather than one per track:
 * only one lullaby ever plays, and a shared element keeps looping and pausing
 * in one place.
 */
export function LullabyAudioProvider({ children }: { readonly children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [lullabies, setLullabies] = useState<Lullaby[] | null>(null);
  const [currentUrl, setCurrentUrl] = useState<null | string>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>(DEFAULT_LOOP_MODE);
  const nextLoopMode = getNextLoopMode(loopMode, lullabies?.length ?? 0);

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

  const cycleLoopMode = useCallback(() => {
    setLoopMode(nextLoopMode);
    window.localStorage.setItem(LOOP_MODE_STORAGE_KEY, nextLoopMode);
  }, [nextLoopMode]);

  const startTrack = useCallback((url: string) => {
    const audio = audioRef.current;

    if (audio !== null) {
      setCurrentUrl(url);
      audio.src = url;
      void audio.play();
    }
  }, []);

  const playTrack = useCallback(
    (url: string) => {
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
    },
    [currentUrl, isPlaying, startTrack],
  );

  function handleEnded() {
    const currentIndex = lullabies?.findIndex((lullaby) => lullaby.url === currentUrl) ?? -1;
    const nextLullaby = lullabies === null ? undefined : lullabies[(currentIndex + 1) % lullabies.length];

    if (loopMode === 'all' && currentIndex !== -1 && nextLullaby !== undefined) {
      startTrack(nextLullaby.url);
    } else {
      setIsPlaying(false);
    }
  }

  const value = useMemo(
    () => ({ currentUrl, cycleLoopMode, isPlaying, loopMode, lullabies, nextLoopMode, playTrack, setLullabies }),
    [currentUrl, cycleLoopMode, isPlaying, loopMode, lullabies, nextLoopMode, playTrack],
  );

  return (
    <LullabyAudioContext value={value}>
      {children}
      <audio onEnded={() => handleEnded()} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} ref={audioRef} />
    </LullabyAudioContext>
  );
}
