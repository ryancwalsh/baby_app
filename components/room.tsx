"use client";

import { useCallback, useEffect, useState } from "react";
import { getLampsAction, type Lamp } from "@/app/actions/lamp";
import { logInAction } from "@/app/actions/login";
import { getNightLightAction } from "@/app/actions/night-light";
import { getTapoCloudStatusAction } from "@/app/actions/tapo-login";
import { LampToggle, UnreachableLampRow } from "@/components/lamp-toggle";
import { LoginGate } from "@/components/login-gate";
import { NightLight } from "@/components/night-light";
import { TapoCloudLogin } from "@/components/tapo-cloud-login";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { NightLightState } from "@/lib/nanit/night-light";

const SECRET_HASH_KEY = "baby-app-secret-hash";

interface RoomState {
  lamps: Lamp[];
  nightLight: NightLightState;
  isTapoSignedIn: boolean;
}

/**
 * Nothing about the room is fetched until the password has been accepted, so an
 * unlocked page never reveals device state — and the actions themselves check
 * the hash again, because a client-side gate alone would be decoration.
 */
export function Room() {
  const {
    value: secretHash,
    isLoaded,
    store,
  } = useLocalStorage(SECRET_HASH_KEY);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (hash: string) => {
      /**
       * Checked on its own first, so that a camera or plug that is merely
       * having a bad day cannot be mistaken for a bad password and log someone
       * out of the app.
       */
      if (await logInAction(hash)) {
        try {
          const [lamps, nightLight, tapo] = await Promise.all([
            getLampsAction(hash),
            getNightLightAction(hash),
            getTapoCloudStatusAction(hash),
          ]);
          setState({ lamps, nightLight, isTapoSignedIn: tapo.isSignedIn });
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load the room.",
          );
        }
      } else {
        store(null);
        setError("That login is no longer valid.");
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load(secretHash);
    }
  }, [isLoaded, secretHash, load]);

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
          lamp.isReachable ? (
            <LampToggle
              key={lamp.deviceId}
              lamp={lamp}
              secretHash={secretHash}
            />
          ) : (
            <UnreachableLampRow key={lamp.deviceId} lamp={lamp} />
          ),
        )}
      </div>

      {!state.isTapoSignedIn && (
        <TapoCloudLogin
          secretHash={secretHash}
          onSignedIn={() => load(secretHash)}
        />
      )}

      <NightLight initialState={state.nightLight} secretHash={secretHash} />
    </div>
  );
}
