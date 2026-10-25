'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import { getNotesAction, saveNotesAction } from '@/app/actions/notes';
import { NOTES_BUTTON_CLASS_NAME, NotesHistory } from '@/components/notes-history';
import { formatAgo } from '@/components/tracking-format';
import { useNow } from '@/hooks/use-now';
import { type Notes } from '@/storage/notes';

/**
 * Milkdown needs the DOM, so it is not rendered on the server. Loading it this way also keeps it out of the bundles of every other page.
 */
const MilkdownEditor = dynamic(async () => import('@/components/milkdown-editor'), {
  loading: () => <p className="text-muted p-4">Loading the editor…</p>,
  ssr: false,
});

/**
 * How long after the last keystroke the notes are saved.
 */
const SAVE_DELAY_MILLISECONDS = 1_000;

/**
 * - saved: what is on screen is in the database.
 * - unsaved: a save is waiting for typing to stop.
 * - saving: a save is on its way.
 * - conflict: someone saved elsewhere, such as on another phone, so saving stopped instead of overwriting them.
 * - failed: the save did not reach the server, such as when offline. The next change, or the button, tries again.
 */
type SaveStatus = 'conflict' | 'failed' | 'saved' | 'saving' | 'unsaved';

function SaveStatusText({ savedAt, status }: { readonly savedAt: null | string; readonly status: SaveStatus }) {
  const now = useNow();
  let text = <span>Nothing saved yet.</span>;
  if (status === 'conflict') {
    text = <span className="text-accent">Not saved.</span>;
  } else if (status === 'failed') {
    text = <span className="text-accent">Could not save. Check the connection.</span>;
  } else if (status === 'saving' || status === 'unsaved') {
    text = <span>Saving…</span>;
  } else if (savedAt !== null && now !== null) {
    text = <span>Saved {formatAgo(now - new Date(savedAt).getTime())}</span>;
  }

  return text;
}

/**
 * A big markdown editor that saves itself, with a history of earlier versions to restore.
 */
function NotesEditor({ initialNotes, secretHash }: { readonly initialNotes: Notes; readonly secretHash: string }) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [savedAt, setSavedAt] = useState(initialNotes.updatedAt);
  /**
   * Changing the key makes React create the editor again, which is the only way to put other text into it, such as a restored version.
   */
  const [editor, setEditor] = useState({ initialValue: initialNotes.content, key: 0 });

  /**
   * Refs, not state, because the save loop below reads them after awaiting, when state from its render would be out of date.
   */
  const latestContent = useRef(initialNotes.content);
  const savedContent = useRef(initialNotes.content);
  /**
   * The updatedAt of the text in the database, which the server compares to notice a save from elsewhere.
   */
  const expectedUpdatedAt = useRef(initialNotes.updatedAt);
  const isSaving = useRef(false);
  const hasConflict = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /**
   * Saves until the database has what is on screen. Only one save runs at a time, because two at once would both send the same expectedUpdatedAt and the second would be refused as a conflict. A change made during a save is picked up by the loop when that save returns.
   */
  async function save() {
    clearTimeout(saveTimer.current);
    if (!isSaving.current && !hasConflict.current) {
      isSaving.current = true;
      try {
        while (!hasConflict.current && latestContent.current !== savedContent.current) {
          const content = latestContent.current;
          setStatus('saving');
          const result = await saveNotesAction(secretHash, content, expectedUpdatedAt.current);
          if (result.status === 'conflict') {
            // eslint-disable-next-line require-atomic-updates -- Only one save loop runs at a time, guarded by isSaving, so nothing else writes these refs while it awaits.
            hasConflict.current = true;
            setStatus('conflict');
          } else {
            // eslint-disable-next-line require-atomic-updates -- Only one save loop runs at a time, guarded by isSaving, so nothing else writes these refs while it awaits.
            savedContent.current = content;
            // eslint-disable-next-line require-atomic-updates -- Only one save loop runs at a time, guarded by isSaving, so nothing else writes these refs while it awaits.
            expectedUpdatedAt.current = result.updatedAt;
            setSavedAt(result.updatedAt);
          }
        }

        if (!hasConflict.current) {
          setStatus('saved');
        }
      } catch {
        setStatus('failed');
      } finally {
        isSaving.current = false;
      }
    }
  }

  function handleChange(markdown: string) {
    latestContent.current = markdown;
    if (!hasConflict.current) {
      setStatus('unsaved');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        save();
      }, SAVE_DELAY_MILLISECONDS);
    }
  }

  /**
   * Puts an earlier version on screen and saves it, which records the text it replaces as a version, so the restore can itself be undone.
   */
  function restore(content: string) {
    latestContent.current = content;
    setEditor((current) => ({ initialValue: content, key: current.key + 1 }));
    save();
  }

  /**
   * Leaving the page with changes that are not saved yet makes the browser ask first.
   */
  const hasUnsavedChanges = status !== 'saved';
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    if (hasUnsavedChanges) {
      window.addEventListener('beforeunload', warn);
    }

    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [hasUnsavedChanges]);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted flex flex-wrap items-center gap-3 text-sm">
        <SaveStatusText savedAt={savedAt} status={status} />
        {status === 'failed' && (
          <button
            className={NOTES_BUTTON_CLASS_NAME}
            onClick={() => {
              save();
            }}
            type="button"
          >
            Try again
          </button>
        )}
        <div className="ml-auto">
          <NotesHistory onRestore={restore} secretHash={secretHash} />
        </div>
      </div>
      {status === 'conflict' && (
        <p className="rounded-lg border border-accent/40 p-3 text-sm text-accent" role="alert">
          These notes were saved somewhere else, perhaps on another phone, so saving stopped to avoid overwriting that. Copy what you changed, reload the page, and paste it back
          in.
        </p>
      )}
      <div className="border-foreground/10 rounded-xl border">
        <MilkdownEditor initialValue={editor.initialValue} key={editor.key} onChange={handleChange} />
      </div>
    </div>
  );
}

/**
 * Loads the notes once logged in, then hands them to the editor, which only reads its initial text once.
 */
export function NotesPage({ secretHash }: { readonly secretHash: string }) {
  const [notes, setNotes] = useState<Notes | null>(null);
  const [error, setError] = useState<null | string>(null);

  useEffect(() => {
    async function load() {
      try {
        setNotes(await getNotesAction(secretHash));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load the notes.');
      }
    }

    load();
  }, [secretHash]);

  let body = <p className="text-muted text-sm">Loading…</p>;
  if (error !== null) {
    body = <p className="text-sm text-accent">{error}</p>;
  } else if (notes !== null) {
    body = <NotesEditor initialNotes={notes} secretHash={secretHash} />;
  }

  return body;
}
