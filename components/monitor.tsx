'use client';

import { useCallback, useEffect, useState } from 'react';

import { getNightLightAction } from '@/app/actions/night-light';
import { NightLight } from '@/components/night-light';
import { VideoFeedPlaceholder } from '@/components/video-feed-placeholder';
import { type NightLightState } from '@/services/nanit/night-light';

/**
 * The monitor page is the lights page without the Tapo switches: the night
 * light, and the live video feed that will eventually replace the placeholder.
 */
export function Monitor({ secretHash }: { readonly secretHash: string }) {
  const [nightLight, setNightLight] = useState<NightLightState | null>(null);
  const [error, setError] = useState<null | string>(null);

  const load = useCallback(async () => {
    try {
      setNightLight(await getNightLightAction(secretHash));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load the monitor.');
    }
  }, [secretHash]);

  useEffect(() => {
    load();
  }, [load]);

  if (error !== null) {
    return <p className="text-sm text-amber-500">{error}</p>;
  }

  if (nightLight === null) {
    return <p className="text-sm opacity-60">Loading the room…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <NightLight initialState={nightLight} secretHash={secretHash} />
      <VideoFeedPlaceholder />
    </div>
  );
}
