'use client';

import { useCallback, useEffect, useState } from 'react';

import { getLampsAction, type Lamp } from '@/app/actions/lamp';
import { getNightLightAction } from '@/app/actions/night-light';
import { getTapoCloudStatusAction } from '@/app/actions/tapo-login';
import { ClockAndLullaby } from '@/components/clock-and-lullaby';
import { LampToggle, UnreachableLampRow } from '@/components/lamp-toggle';
import { NightLight } from '@/components/night-light';
import { TapoCloudLogin } from '@/components/tapo-cloud-login';
import { type NightLightState } from '@/services/nanit/night-light';

type LightsState = {
  isTapoSignedIn: boolean;
  lamps: Lamp[];
  nightLight: NightLightState;
};

/**
 * What the room looked like the last time this page was open, kept so that
 * flipping to another tab and back shows the switches at once rather than
 * "Loading the room…" and three round trips through the tunnel.
 *
 * It is only ever a first paint. The page reads every device again as it
 * mounts, and the controls report each change here as it happens, so what is
 * shown on return is what was last seen or set rather than the first load.
 * A module variable, so a reload forgets it.
 */
let remembered: null | { secretHash: string; state: LightsState } = null;

function rememberLamp(deviceId: string, isOn: boolean) {
  if (remembered !== null) {
    remembered.state = { ...remembered.state, lamps: remembered.state.lamps.map((lamp) => (lamp.deviceId === deviceId && lamp.isReachable ? { ...lamp, isOn } : lamp)) };
  }
}

function rememberNightLight(nightLight: NightLightState) {
  if (remembered !== null) {
    remembered.state = { ...remembered.state, nightLight };
  }
}

/**
 * Every device is read independently and the whole load is caught here, so one
 * unreachable plug cannot take the page down.
 */
export function Lights({ secretHash }: { readonly secretHash: string }) {
  const [state, setState] = useState<LightsState | null>(() => (remembered?.secretHash === secretHash ? remembered.state : null));
  const [error, setError] = useState<null | string>(null);

  const load = useCallback(async () => {
    try {
      const [lamps, nightLight, tapo] = await Promise.all([getLampsAction(secretHash), getNightLightAction(secretHash), getTapoCloudStatusAction(secretHash)]);
      const loaded = { isTapoSignedIn: tapo.isSignedIn, lamps, nightLight };

      remembered = { secretHash, state: loaded };
      setState(loaded);
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
      <NightLight initialState={state.nightLight} onChange={rememberNightLight} secretHash={secretHash} />

      <ClockAndLullaby secretHash={secretHash} />

      <div className="flex flex-col gap-3">
        {state.lamps.map((lamp) =>
          /**
           * Keyed on the state as well, so a fresh read that disagrees with
           * what was remembered replaces the switch rather than being ignored
           * by one that only looks at its lamp when it mounts.
           */
          lamp.isReachable ? (
            <LampToggle key={`${lamp.deviceId}-${lamp.isOn}`} lamp={lamp} onChange={rememberLamp} secretHash={secretHash} />
          ) : (
            <UnreachableLampRow key={lamp.deviceId} lamp={lamp} />
          ),
        )}
      </div>

      {!state.isTapoSignedIn && <TapoCloudLogin onSignedIn={load} secretHash={secretHash} />}
    </div>
  );
}
