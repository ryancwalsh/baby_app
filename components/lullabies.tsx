'use client';

import { useEffect, useState } from 'react';

import { getLullabiesAction, type Lullaby } from '@/app/actions/lullaby';
import { LullabyPlayer } from '@/components/lullaby-player';

export function Lullabies({ secretHash }: { readonly secretHash: string }) {
  const [lullabies, setLullabies] = useState<Lullaby[] | null>(null);
  const [error, setError] = useState<null | string>(null);

  useEffect(() => {
    async function load() {
      try {
        setLullabies(await getLullabiesAction(secretHash));
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load the lullabies.');
      }
    }

    load();
  }, [secretHash]);

  if (error !== null) {
    return <p className="text-sm text-amber-500">{error}</p>;
  }

  if (lullabies === null) {
    return <p className="text-sm opacity-60">Loading the lullabies…</p>;
  }

  return <LullabyPlayer lullabies={lullabies} />;
}
