"use client";

import { useState, useTransition } from "react";
import { logInAction } from "@/app/actions/login";
import { hashPassword } from "@/lib/hash-password";

/**
 * The password is hashed here and only the hash is sent, but the check that
 * matters happens on the server: every device action verifies the hash again.
 * This form is the convenience, not the lock.
 */
export function LoginGate({ onUnlock }: { onUnlock: (hash: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const hash = await hashPassword(password);
      if (await logInAction(hash)) {
        onUnlock(hash);
      } else {
        setError("That password did not work.");
        setPassword("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="password" className="text-foreground/60 font-semibold">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={isPending}
        className="border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4 disabled:opacity-60"
      />
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      <button
        type="submit"
        disabled={isPending || password === ""}
        className="border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4 font-semibold disabled:opacity-40"
      >
        {isPending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
