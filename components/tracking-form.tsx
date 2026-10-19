'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { type ActionResult } from '@/app/actions/tracking';

/**
 * How long the confirm button stays dead after it appears, so a double tap on delete cannot answer its own question.
 */
const DELETE_ARMING_MILLISECONDS = 1_000;

function DeleteButton({ onDelete }: { readonly onDelete: () => void }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isArmed, setIsArmed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isConfirming) {
      timer = setTimeout(() => {
        setIsArmed(true);
      }, DELETE_ARMING_MILLISECONDS);
    }

    return () => {
      clearTimeout(timer);
    };
  }, [isConfirming]);

  return isConfirming ? (
    <div className="flex items-center gap-2 text-sm text-red-500">
      <span>Delete for good?</span>
      <button className="rounded-lg border border-red-500/60 px-3 py-1.5 disabled:opacity-60" disabled={!isArmed} onClick={onDelete} type="button">
        Delete
      </button>
      <button
        className="border-foreground/15 text-foreground/60 rounded-lg border px-3 py-1.5"
        onClick={() => {
          setIsConfirming(false);
          setIsArmed(false);
        }}
        type="button"
      >
        Keep
      </button>
    </div>
  ) : (
    <button
      className="self-start text-sm text-red-500/80"
      onClick={() => {
        setIsConfirming(true);
      }}
      type="button"
    >
      Delete
    </button>
  );
}

/**
 * The frame every tracking form shares: a title, the fields, and save, cancel, and — for an entry that already exists — delete. A new entry goes back to the tiles once saved; an edited one goes back to the report, unless `?from=track` says it was opened from the tiles.
 */
export function TrackingForm({
  children,
  colorClassName,
  isEditing,
  isLoaded,
  onDelete,
  onSave,
  title,
}: {
  readonly children: ReactNode;
  readonly colorClassName: string;
  readonly isEditing: boolean;
  readonly isLoaded: boolean;
  readonly onDelete: () => Promise<ActionResult>;
  readonly onSave: () => Promise<ActionResult>;
  readonly title: string;
}) {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const [error, setError] = useState<null | string>(null);
  const [isBusy, setIsBusy] = useState(false);
  const returnHref = isEditing && searchParameters.get('from') !== 'track' ? '/reports' : '/track';

  async function finish(work: () => Promise<ActionResult>) {
    setIsBusy(true);
    try {
      const result = await work();
      if (result.error === null) {
        router.push(returnHref);
      } else {
        setError(result.error);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setIsBusy(false);
    }
  }

  return isLoaded ? (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        finish(onSave);
      }}
    >
      <h2 className={`text-lg font-semibold ${colorClassName}`}>
        {isEditing ? 'Edit' : 'New'} {title.toLowerCase()}
      </h2>
      {children}
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      <div className="flex gap-3">
        <button className={`border-foreground/15 rounded-lg border px-4 py-2 font-semibold disabled:opacity-60 ${colorClassName}`} disabled={isBusy} type="submit">
          Save
        </button>
        <button
          className="text-foreground/60 px-4 py-2"
          onClick={() => {
            router.push(returnHref);
          }}
          type="button"
        >
          Cancel
        </button>
      </div>
      {isEditing && (
        <DeleteButton
          onDelete={() => {
            finish(onDelete);
          }}
        />
      )}
    </form>
  ) : (
    <p className="text-sm opacity-60">Loading…</p>
  );
}
