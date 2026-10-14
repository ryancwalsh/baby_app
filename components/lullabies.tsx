'use client';

import { useCallback, useEffect, useState } from 'react';

import { getLullabiesAction } from '@/app/actions/lullaby';
import { useLullabyAudio } from '@/components/lullaby-audio-provider';
import { LullabyPlayer } from '@/components/lullaby-player';

/**
 * The list is handed to the provider as well as rendered, because a track that
 * ends after the user has walked to another tab still has to know what comes
 * next.
 */
export function Lullabies({ secretHash }: { readonly secretHash: string }) {
  const { lullabies, setLullabies } = useLullabyAudio();
  const [error, setError] = useState<null | string>(null);

  const reload = useCallback(async () => {
    try {
      setLullabies(await getLullabiesAction(secretHash));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load the lullabies.');
    }
  }, [secretHash, setLullabies]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error !== null) {
    return <p className="text-sm text-amber-500">{error}</p>;
  }

  if (lullabies === null) {
    return <p className="text-sm opacity-60">Loading the lullabies…</p>;
  }

  return <LullabyPlayer lullabies={lullabies} onChanged={reload} secretHash={secretHash} />;
}
