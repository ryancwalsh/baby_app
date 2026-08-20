'use client';

import { useCallback, useEffect, useState } from 'react';

import { logInAction } from '@/app/actions/login';
import { LoginGate } from '@/components/login-gate';
import { useLocalStorage } from '@/hooks/use-local-storage';

export const SECRET_HASH_KEY = 'baby-app-secret-hash';

/**
 * Nothing about the room is fetched until the password has been accepted, so an
 * unlocked page never reveals device state — and the actions themselves check
 * the hash again, because a client-side gate alone would be decoration.
 *
 * The password is checked on its own, before any device is read, so that a
 * camera or plug that is merely having a bad day cannot be mistaken for a bad
 * password and log someone out of the app.
 */
export function LoginGuard({ children }: { readonly children: (secretHash: string) => React.ReactNode }) {
  const { isLoaded, store, value: secretHash } = useLocalStorage(SECRET_HASH_KEY);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<null | string>(null);

  const check = useCallback(
    async (hash: string) => {
      const attempt = await logInAction(hash);

      if (attempt.isLoggedIn) {
        setIsLoggedIn(true);
      } else if (attempt.lockedForSeconds === null) {
        store(null);
        setError('That login is no longer valid.');
      } else {
        /**
         * Locked out, not wrong: keep the stored hash so a wait is enough.
         */
        setError(`Too many attempts. Try again in ${Math.ceil(attempt.lockedForSeconds / 60)} minutes.`);
      }
    },
    [store],
  );

  useEffect(() => {
    if (isLoaded && secretHash !== null && secretHash !== undefined) {
      /**
       * The rule fires on `check` because it sets state, but that write happens
       * after an await, once the server has answered — this is fetching on
       * mount, not a synchronous cascade.
       */
      check(secretHash);
    }
  }, [check, isLoaded, secretHash]);

  if (!isLoaded) {
    return null;
  }

  if (secretHash === null || secretHash === undefined) {
    return (
      <div className="flex flex-col gap-3">
        {error !== null && <p className="text-sm text-amber-500">{error}</p>}
        <LoginGate onUnlock={store} />
      </div>
    );
  }

  if (isLoggedIn) {
    return children(secretHash);
  }

  return <p className="text-sm opacity-60">{error ?? 'Unlocking…'}</p>;
}
