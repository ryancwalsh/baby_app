'use client';

import { useState, useTransition } from 'react';

import { logInAction } from '@/app/actions/login';
import { hashPassword } from '@/lib/hash-password';

/**
 * The password is hashed here and only the hash is sent, but the check that
 * matters happens on the server: every device action verifies the hash again.
 * This form is the convenience, not the lock.
 */
export function LoginGate({ onUnlock }: { readonly onUnlock: (hash: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<null | string>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const hash = await hashPassword(password);
      const attempt = await logInAction(hash);

      if (attempt.isLoggedIn) {
        onUnlock(hash);
      } else {
        setError(attempt.lockedForSeconds === null ? 'That password did not work.' : `Too many attempts. Try again in ${Math.ceil(attempt.lockedForSeconds / 60)} minutes.`);
        setPassword('');
      }
    });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <label className="text-foreground/60 font-semibold" htmlFor="password">
        Password
      </label>
      <input
        autoComplete="current-password"
        className="border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4 disabled:opacity-60"
        disabled={isPending}
        id="password"
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        value={password}
      />
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      <button className="border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4 font-semibold disabled:opacity-40" disabled={isPending || password === ''} type="submit">
        {isPending ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  );
}
