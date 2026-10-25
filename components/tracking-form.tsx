'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { type ActionResult } from '@/app/actions/tracking';
import { DAY_CALENDAR_HREF, TRACKING_LIST_HREF } from '@/hooks/use-tracking-view';

/**
 * How long the confirm button stays dead after it appears, so a double tap on delete cannot answer its own question.
 */
const DELETE_ARMING_MILLISECONDS = 1_000;

/**
 * A new entry goes back to the tiles once saved. An edited one goes back to wherever it was opened from: `?from=track` for the tiles, `?from=day&date=` for that day on the day calendar, and otherwise the tracking list.
 */
function getReturnHref(isEditing: boolean, from: null | string, date: null | string): string {
  let href = '/track';
  if (isEditing && from === 'day' && date !== null) {
    href = `${DAY_CALENDAR_HREF}?date=${encodeURIComponent(date)}`;
  } else if (isEditing && from !== 'track') {
    href = TRACKING_LIST_HREF;
  }

  return href;
}

/**
 * The tap that asks is `children`, or the word Delete when there are none.
 */
export function DeleteButton({ children = 'Delete', onDelete }: { readonly children?: ReactNode; readonly onDelete: () => void }) {
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
    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
      <span>Delete for good?</span>
      <button className="rounded-lg border border-red-500/60 px-3 py-1.5 disabled:opacity-60" disabled={!isArmed} onClick={onDelete} type="button">
        Delete
      </button>
      <button
        className="border-foreground/15 text-muted rounded-lg border px-3 py-1.5"
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
      className="self-start text-sm text-red-600 dark:text-red-400"
      onClick={() => {
        setIsConfirming(true);
      }}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * The frame every tracking form shares: a title, the fields, and save, cancel, and — for an entry that already exists — delete. Each of those leaves the form for the place `getReturnHref` names.
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
  const returnHref = getReturnHref(isEditing, searchParameters.get('from'), searchParameters.get('date'));

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
      {error !== null && <p className="text-sm text-accent">{error}</p>}
      <div className="flex gap-3">
        <button className={`border-foreground/15 rounded-lg border px-4 py-2 font-semibold disabled:opacity-60 ${colorClassName}`} disabled={isBusy} type="submit">
          Save
        </button>
        <button
          className="text-muted px-4 py-2"
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
    <p className="text-muted text-sm">Loading…</p>
  );
}
