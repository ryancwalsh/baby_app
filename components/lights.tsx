'use client';

import { useCallback, useEffect, useState } from 'react';

import { getLampsAction, type Lamp } from '@/app/actions/lamp';
import { getNightLightAction } from '@/app/actions/night-light';
import { getTapoCloudStatusAction } from '@/app/actions/tapo-login';
import { LampToggle, UnreachableLampRow } from '@/components/lamp-toggle';
import { NightLight } from '@/components/night-light';
import { TapoCloudLogin } from '@/components/tapo-cloud-login';
import { type NightLightState } from '@/lib/nanit/night-light';

type LightsState = {
  isTapoSignedIn: boolean;
  lamps: Lamp[];
  nightLight: NightLightState;
};

/**
 * Every device is read independently and the whole load is caught here, so one
 * unreachable plug cannot take the page down.
 */
export function Lights({ secretHash }: { readonly secretHash: string }) {
  const [state, setState] = useState<LightsState | null>(null);
  const [error, setError] = useState<null | string>(null);

  const load = useCallback(async () => {
    try {
      const [lamps, nightLight, tapo] = await Promise.all([getLampsAction(secretHash), getNightLightAction(secretHash), getTapoCloudStatusAction(secretHash)]);
      setState({ isTapoSignedIn: tapo.isSignedIn, lamps, nightLight });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load the lights.');
    }
  }, [secretHash]);

  useEffect(() => {
    load();
  }, [load]);

  if (error !== null) {
    return <p className="text-sm text-amber-500">{error}</p>;
  }

  if (state === null) {
    return <p className="text-sm opacity-60">Loading the room…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <NightLight initialState={state.nightLight} secretHash={secretHash} />

      <div className="flex flex-col gap-3">
        {state.lamps.map((lamp) =>
          lamp.isReachable ? <LampToggle key={lamp.deviceId} lamp={lamp} secretHash={secretHash} /> : <UnreachableLampRow key={lamp.deviceId} lamp={lamp} />,
        )}
      </div>

      {!state.isTapoSignedIn && <TapoCloudLogin onSignedIn={load} secretHash={secretHash} />}
    </div>
  );
}
