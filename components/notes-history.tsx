'use client';

import { HistoryIcon, XIcon } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';

import { getNoteVersionTextAction, listNoteVersionsAction } from '@/app/actions/notes';
import { type NoteVersionSummary } from '@/storage/notes';

export const NOTES_BUTTON_CLASS_NAME = 'border-foreground/20 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm';

/**
 * A button that opens the earlier versions of the notes in a dialog. Picking one shows its markdown, which can then be restored.
 *
 * The versions are loaded when the dialog opens, not with the page, because they are rarely needed, and each one has to be rebuilt from patches (see storage/notes-history.ts).
 */
export function NotesHistory({ onRestore, secretHash }: { readonly onRestore: (content: string) => void; readonly secretHash: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<NoteVersionSummary[] | null>(null);
  const [preview, setPreview] = useState<null | { content: string; id: number }>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setVersions(null);
    setPreview(null);
    dialog.current?.showModal();
    startTransition(async () => {
      setVersions(await listNoteVersionsAction(secretHash));
    });
  }

  function showVersion(id: number) {
    startTransition(async () => {
      const content = await getNoteVersionTextAction(secretHash, id);
      setPreview(content === null ? null : { content, id });
    });
  }

  function restore(content: string) {
    onRestore(content);
    dialog.current?.close();
  }

  return (
    <>
      <button className={NOTES_BUTTON_CLASS_NAME} onClick={open} type="button">
        <HistoryIcon className="size-4" />
        History
      </button>
      <dialog aria-label="Earlier versions" className="bg-background text-foreground m-auto h-[85vh] w-[95vw] max-w-md rounded-xl backdrop:bg-black/70" ref={dialog}>
        <div className="flex h-full flex-col">
          <div className="border-foreground/10 flex items-center gap-3 border-b p-3">
            <h2 className="text-lg font-semibold">Earlier versions</h2>
            <button
              aria-label="Close"
              className="ml-auto p-2"
              onClick={() => {
                dialog.current?.close();
              }}
              type="button"
            >
              <XIcon className="size-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <ul className="border-foreground/10 max-h-40 shrink-0 overflow-y-auto border-b p-2">
              {versions?.length === 0 && <li className="text-foreground/60 p-2 text-sm">No earlier versions yet. One is kept for every ten minutes of editing.</li>}
              {versions?.map((version) => (
                <li key={version.id}>
                  <button
                    className={`w-full rounded-md p-2 text-left text-sm ${preview?.id === version.id ? 'font-semibold text-amber-500' : ''}`}
                    onClick={() => {
                      showVersion(version.id);
                    }}
                    type="button"
                  >
                    {new Date(version.textSavedAt).toLocaleString()}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
              {preview === null ? (
                <p className="text-foreground/60 text-sm">{isPending ? 'Loading…' : 'Pick a version to see it.'}</p>
              ) : (
                <>
                  <pre className="bg-foreground/5 min-h-0 flex-1 overflow-auto rounded-md p-3 text-sm whitespace-pre-wrap">{preview.content}</pre>
                  <button
                    className={`${NOTES_BUTTON_CLASS_NAME} self-start text-amber-500`}
                    onClick={() => {
                      restore(preview.content);
                    }}
                    type="button"
                  >
                    Restore this version
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
