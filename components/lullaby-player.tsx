'use client';

import { CheckIcon, MusicIcon, PauseIcon, PencilIcon, PlayIcon, Repeat1Icon, RepeatIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

import { type Lullaby, renameLullabyAction } from '@/app/actions/lullaby';
import { type LoopMode, useLullabyAudio } from '@/components/lullaby-audio-provider';
import { LullabyRecorder } from '@/components/lullaby-recorder';

const CARD_CLASS_NAME = 'border-foreground/15 bg-foreground/2 dark:bg-black rounded-2xl border px-5 py-4';

const ROW_CLASS_NAME = 'flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm';

const LOOP_MODES: Record<LoopMode, { icon: typeof RepeatIcon; label: string }> = {
  all: { icon: RepeatIcon, label: 'Loop all' },
  off: { icon: RepeatIcon, label: 'Loop off' },
  one: { icon: Repeat1Icon, label: 'Loop 1' },
};

type LullabyPlayerProps = {
  readonly lullabies: Lullaby[];
  /**
   * Fetches the list again after a recording or a rename changed the folder.
   */
  readonly onChanged: () => Promise<void>;
  readonly secretHash: string;
};

function RenameForm({ lullaby, onChanged, onDone, secretHash }: Omit<LullabyPlayerProps, 'lullabies'> & { readonly lullaby: Lullaby; readonly onDone: () => void }) {
  const [draft, setDraft] = useState(lullaby.name);
  const [error, setError] = useState<null | string>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (draft.trim() === lullaby.name) {
      onDone();

      return;
    }

    setIsSaving(true);
    try {
      const result = await renameLullabyAction(secretHash, lullaby.fileName, draft);

      if (result.error === null) {
        await onChanged();
        onDone();
      } else {
        setError(result.error);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not rename the lullaby.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className={`${ROW_CLASS_NAME} border-foreground/15`}>
        <input
          aria-label={`New name for ${lullaby.name}`}
          autoFocus
          className="min-w-0 flex-1 bg-transparent outline-none"
          disabled={isSaving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onDone();
            }
          }}
          value={draft}
        />
        <button aria-label="Save the name" className="shrink-0 opacity-70" disabled={isSaving} type="submit">
          <CheckIcon className="size-4" />
        </button>
        <button aria-label="Cancel renaming" className="shrink-0 opacity-70" disabled={isSaving} onClick={() => onDone()} type="button">
          <XIcon className="size-4" />
        </button>
      </div>
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
    </form>
  );
}

/**
 * The playing is `LullabyAudioProvider`'s, above the router; this is the list
 * that drives it and the state it reports back.
 */
export function LullabyPlayer({ lullabies, onChanged, secretHash }: LullabyPlayerProps) {
  const { currentUrl, cycleLoopMode, isPlaying, loopMode, nextLoopMode, playTrack } = useLullabyAudio();
  const [renamingFileName, setRenamingFileName] = useState<null | string>(null);

  const currentLullaby = lullabies.find((lullaby) => lullaby.url === currentUrl);
  const LoopIcon = LOOP_MODES[loopMode].icon;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-foreground/60 flex items-center gap-2 text-lg font-semibold">
        <MusicIcon className="size-5 opacity-60" />
        Lullabies
      </h2>

      <LullabyRecorder onSaved={onChanged} secretHash={secretHash} />

      {lullabies.length === 0 ? (
        <p className={`${CARD_CLASS_NAME} text-sm opacity-70`}>No lullabies yet. Record one, or add mp3 files to the lullabies folder.</p>
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

              if (lullaby.fileName === renamingFileName) {
                return <RenameForm key={lullaby.url} lullaby={lullaby} onChanged={onChanged} onDone={() => setRenamingFileName(null)} secretHash={secretHash} />;
              }

              return (
                <div className="flex items-center gap-2" key={lullaby.url}>
                  <button
                    className={`${ROW_CLASS_NAME} flex-1 ${isSounding ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15'}`}
                    onClick={() => playTrack(lullaby.url)}
                    type="button"
                  >
                    {isSounding ? <PauseIcon className="size-4 shrink-0" /> : <PlayIcon className="size-4 shrink-0" />}
                    <span className="flex-1 break-all">{lullaby.name}</span>
                  </button>
                  {/* A playing track cannot be renamed: the audio element is still reading it by its old name, and would stop. */}
                  <button
                    aria-label={isSounding ? `Pause ${lullaby.name} to rename it` : `Rename ${lullaby.name}`}
                    className="border-foreground/15 shrink-0 rounded-lg border p-3 opacity-70 disabled:opacity-30"
                    disabled={isSounding}
                    onClick={() => setRenamingFileName(lullaby.fileName)}
                    type="button"
                  >
                    <PencilIcon className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
