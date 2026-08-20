'use client';

import { MusicIcon, PauseIcon, PlayIcon, Repeat1Icon, RepeatIcon } from 'lucide-react';

import { type Lullaby } from '@/app/actions/lullaby';
import { type LoopMode, useLullabyAudio } from '@/components/lullaby-audio-provider';

const CARD_CLASS_NAME = 'border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4';

const LOOP_MODES: Record<LoopMode, { icon: typeof RepeatIcon; label: string }> = {
  all: { icon: RepeatIcon, label: 'Loop all' },
  off: { icon: RepeatIcon, label: 'Loop off' },
  one: { icon: Repeat1Icon, label: 'Loop 1' },
};

/**
 * The playing is `LullabyAudioProvider`'s, above the router; this is the list
 * that drives it and the state it reports back.
 */
export function LullabyPlayer({ lullabies }: { readonly lullabies: Lullaby[] }) {
  const { currentUrl, cycleLoopMode, isPlaying, loopMode, nextLoopMode, playTrack } = useLullabyAudio();

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
              aria-label={`${LOOP_MODES[loopMode].label}. Switch to ${LOOP_MODES[nextLoopMode].label}.`}
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
              /**
               * The amber marks sound, not selection: a paused track goes back
               * to the dim border so nothing glows in a dark room once the
               * music has stopped.
               */
              const isSounding = lullaby.url === currentUrl && isPlaying;

              return (
                <button
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm ${isSounding ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15'}`}
                  key={lullaby.url}
                  onClick={() => playTrack(lullaby.url)}
                  type="button"
                >
                  {isSounding ? <PauseIcon className="size-4 shrink-0" /> : <PlayIcon className="size-4 shrink-0" />}
                  <span className="flex-1">{lullaby.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
