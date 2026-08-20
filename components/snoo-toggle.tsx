'use client';

import { BedIcon } from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';

import { getSnooAction, setSnooPowerAction } from '@/app/actions/snoo';
import { SECRET_HASH_KEY } from '@/components/login-guard';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { type SnooState } from '@/lib/snoo/state';

/**
 * Optimistic, like the plug and night light controls: the press changes the
 * button at once and the bassinet's own announcement confirms it a moment
 * later. On failure the button snaps back to where it started.
 *
 * The hash is read here rather than handed down, because this sits in the page
 * header beside the title while `LoginGuard` wraps the body. Reading it is not
 * the check: `setSnooPowerAction` calls `requireLogin` on the server, which is
 * the only judgement that counts.
 */
export function SnooToggle() {
  const { value: secretHash } = useLocalStorage(SECRET_HASH_KEY);
  const [state, setState] = useState<null | SnooState>(null);
  const [error, setError] = useState<null | string>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * A read on mount, which also opens the shared connection so that a session
   * started from the Happiest Baby app shows up here. It never writes.
   */
  const load = useCallback(async () => {
    if (typeof secretHash === 'string') {
      try {
        setState(await getSnooAction(secretHash));
      } catch {
        setError('Could not reach the Snoo.');
      }
    }
  }, [secretHash]);

  useEffect(() => {
    load();
  }, [load]);

  function handleClick() {
    if (state !== null && typeof secretHash === 'string') {
      const previous = state;
      const wanted = !state.isOn;
      setState({ ...state, isOn: wanted });
      setError(null);

      startTransition(async () => {
        try {
          setState(await setSnooPowerAction(secretHash, wanted));
        } catch {
          setState(previous);
          setError('Could not reach the Snoo.');
        }
      });
    }
  }

  const isOn = state?.isOn ?? false;

  return (
    <button
      aria-checked={isOn}
      aria-label="Snoo"
      className={`shrink-0 rounded-lg border p-2 transition-colors disabled:opacity-60 ${isOn ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/40'}`}
      disabled={isPending || state === null}
      onClick={handleClick}
      role="switch"
      title={error ?? state?.level ?? 'Waiting for the Snoo'}
      type="button"
    >
      <BedIcon className="size-6" />
    </button>
  );
}
