'use client';

import { useCallback, useEffect, useState } from 'react';

import { getLampsAction, type Lamp } from '@/app/actions/lamp';
import { logInAction } from '@/app/actions/login';
import { getLullabiesAction, type Lullaby } from '@/app/actions/lullaby';
import { getNightLightAction } from '@/app/actions/night-light';
import { getTapoCloudStatusAction } from '@/app/actions/tapo-login';
import { EndlessNoise } from '@/components/endless-noise';
import { LampToggle, UnreachableLampRow } from '@/components/lamp-toggle';
import { LoginGate } from '@/components/login-gate';
import { LullabyPlayer } from '@/components/lullaby-player';
import { NightLight } from '@/components/night-light';
import { TapoCloudLogin } from '@/components/tapo-cloud-login';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { type NightLightState } from '@/lib/nanit/night-light';

const SECRET_HASH_KEY = 'baby-app-secret-hash';

type RoomState = {
  isTapoSignedIn: boolean;
  lamps: Lamp[];
  lullabies: Lullaby[];
  nightLight: NightLightState;
};

/**
 * Nothing about the room is fetched until the password has been accepted, so an
 * unlocked page never reveals device state — and the actions themselves check
 * the hash again, because a client-side gate alone would be decoration.
 */
export function Room() {
  const { isLoaded, store, value: secretHash } = useLocalStorage(SECRET_HASH_KEY);
  const [state, setState] = useState<null | RoomState>(null);
  const [error, setError] = useState<null | string>(null);

  const load = useCallback(
    async (hash: string) => {
      /**
       * Checked on its own first, so that a camera or plug that is merely
       * having a bad day cannot be mistaken for a bad password and log someone
       * out of the app.
       */
      const attempt = await logInAction(hash);

      if (attempt.isLoggedIn) {
        try {
          const [lamps, nightLight, tapo, lullabies] = await Promise.all([
            getLampsAction(hash),
            getNightLightAction(hash),
            getTapoCloudStatusAction(hash),
            getLullabiesAction(hash),
          ]);
          setState({ isTapoSignedIn: tapo.isSignedIn, lamps, lullabies, nightLight });
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : 'Could not load the room.');
        }
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
       * The rule fires on `load` because it sets state, but every one of those
       * writes happens after an await, once the server has answered — this is
       * fetching on mount, not a synchronous cascade.
       */
      load(secretHash);
    }
  }, [isLoaded, load, secretHash]);

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

  if (state === null) {
    return <p className="text-sm opacity-60">Loading the room…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        {state.lamps.map((lamp) =>
          lamp.isReachable ? <LampToggle key={lamp.deviceId} lamp={lamp} secretHash={secretHash} /> : <UnreachableLampRow key={lamp.deviceId} lamp={lamp} />,
        )}
      </div>

      {!state.isTapoSignedIn && <TapoCloudLogin onSignedIn={() => load(secretHash)} secretHash={secretHash} />}

      <NightLight initialState={state.nightLight} secretHash={secretHash} />

      <LullabyPlayer lullabies={state.lullabies} />

      <EndlessNoise />
    </div>
  );
}
