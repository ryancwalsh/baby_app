'use client';

import { Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { deleteLullabyAction, type Lullaby } from '@/app/actions/lullaby';

/**
 * How long the delete button stays dead after the confirmation opens, so a
 * double tap on the trash can cannot answer its own question.
 */
const DELETE_ARMING_MILLISECONDS = 1_000;

/**
 * Deleting cannot be undone, so the question takes over the row in red and
 * names the file. The buttons are laid out so that "keep it" sits where the
 * trash can was, and "delete forever" is out of the way and briefly disabled.
 * Red is kept to a border and text, so even this does not light up a dark room.
 */
export function LullabyDeleteConfirmation({
  lullaby,
  onChanged,
  onDone,
  secretHash,
}: {
  readonly lullaby: Lullaby;
  readonly onChanged: () => Promise<void>;
  readonly onDone: () => void;
  readonly secretHash: string;
}) {
  const [error, setError] = useState<null | string>(null);
  const [isArmed, setIsArmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsArmed(true), DELETE_ARMING_MILLISECONDS);

    return () => clearTimeout(timer);
  }, []);

  async function confirm() {
    setIsDeleting(true);
    try {
      const result = await deleteLullabyAction(secretHash, lullaby.fileName);

      if (result.error === null) {
        await onChanged();
        onDone();
      } else {
        setError(result.error);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete the lullaby.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-red-500/80 px-4 py-4 text-sm text-red-600 dark:text-red-400" role="alertdialog">
      <p className="flex items-start gap-2 text-base font-bold">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" />
        <span className="break-all">Delete {lullaby.name} forever?</span>
      </p>
      <p>This cannot be undone. The file is gone for good, with no copy anywhere.</p>
      <div className="flex gap-2">
        <button
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-red-500 px-3 py-3 font-bold disabled:opacity-40"
          disabled={!isArmed || isDeleting}
          onClick={() => confirm()}
          type="button"
        >
          <Trash2Icon className="size-4" />
          {isDeleting ? 'Deleting…' : 'Delete forever'}
        </button>
        <button autoFocus className="border-foreground/30 text-foreground flex-1 rounded-lg border px-3 py-3" disabled={isDeleting} onClick={() => onDone()} type="button">
          Keep it
        </button>
      </div>
      {error !== null && <p className="font-semibold">{error}</p>}
    </div>
  );
}
