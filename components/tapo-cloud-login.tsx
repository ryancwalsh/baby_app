'use client';

import { KeyRoundIcon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { startTapoCloudLoginAction, submitTapoMfaCodeAction } from '@/app/actions/tapo-login';

const CARD_CLASS_NAME = 'border-foreground/15 bg-foreground/2 rounded-2xl border px-5 py-4';

/**
 * Signing in to the Tapo cloud, which the S-series switches need and the older
 * Kasa cloud cannot provide. The account has two-step verification on, so
 * starting the login makes TP-Link send a code, which is entered here.
 *
 * The code goes wherever the TP-Link account is set to send it. By default that
 * is a Tapo app notification on a trusted phone, *not* email — there is no way
 * to choose from here, since no dispatch endpoint exists to ask.
 */
export function TapoCloudLogin({ onSignedIn, secretHash }: { readonly onSignedIn: () => void; readonly secretHash: string }) {
  const [needsMfaCode, setNeedsMfaCode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<null | string>(null);
  const [isPending, startTransition] = useTransition();

  function run(act: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await act();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'That failed.');
      }
    });
  }

  function handleStart() {
    run(async () => {
      const outcome = await startTapoCloudLoginAction(secretHash);
      if (outcome.needsMfaCode) {
        setNeedsMfaCode(true);
      } else {
        onSignedIn();
      }
    });
  }

  function handleSubmitCode(event: React.FormEvent) {
    event.preventDefault();
    run(async () => {
      await submitTapoMfaCodeAction(secretHash, code.trim());
      setCode('');
      setNeedsMfaCode(false);
      onSignedIn();
    });
  }

  return (
    <section className={`${CARD_CLASS_NAME} flex flex-col gap-3`}>
      <h2 className="text-foreground/60 flex items-center gap-2 font-semibold">
        <KeyRoundIcon className="size-5 opacity-60" />
        Tapo cloud sign-in
      </h2>
      <p className="text-sm opacity-70">The S505 switches need the Tapo cloud, which is signed out.</p>

      {needsMfaCode ? (
        <form className="flex flex-col gap-3" onSubmit={handleSubmitCode}>
          <label className="text-sm opacity-70" htmlFor="mfaCode">
            Enter the code TP-Link sent. Check your Tapo app notifications; it only goes to email if the account is set that way.
          </label>
          <input
            autoComplete="one-time-code"
            className="border-foreground/15 rounded-lg border px-4 py-3 tracking-widest tabular-nums disabled:opacity-60"
            disabled={isPending}
            id="mfaCode"
            inputMode="numeric"
            onChange={(event) => setCode(event.target.value)}
            type="text"
            value={code}
          />
          <button className="border-foreground/15 rounded-lg border py-2 text-sm font-semibold disabled:opacity-40" disabled={isPending || code.trim() === ''} type="submit">
            {isPending ? 'Verifying…' : 'Verify code'}
          </button>
        </form>
      ) : (
        <button className="border-foreground/15 rounded-lg border py-2 text-sm font-semibold disabled:opacity-40" disabled={isPending} onClick={handleStart} type="button">
          {isPending ? 'Signing in…' : 'Sign in and send me a code'}
        </button>
      )}

      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
    </section>
  );
}
