'use client';

import { useEffect, useState } from 'react';

import { getSwitchNamesAction } from '@/app/actions/lamp';
import { ToggleSwitch } from '@/components/toggle-switch';
import { useHiddenSwitches } from '@/hooks/use-hidden-switches';

type SwitchName = { alias: string; deviceId: string };

/**
 * One switch per device in `TAPO_DEVICES`, saying whether the Switches tab shows it on this phone. Only the names are fetched, so opening settings never asks anything of the plugs.
 */
export function ShownSwitches({ secretHash }: { readonly secretHash: string }) {
  const [switches, setSwitches] = useState<null | SwitchName[]>(null);
  const { hiddenDeviceIds, setIsShown } = useHiddenSwitches();

  useEffect(() => {
    async function load() {
      try {
        setSwitches(await getSwitchNamesAction(secretHash));
      } catch {
        setSwitches([]);
      }
    }

    load();
  }, [secretHash]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-muted mb-1 text-sm">Switches shown on this phone</legend>
      {switches === null ? (
        <p className="text-faint text-sm">Loading the switches…</p>
      ) : (
        switches.map(({ alias, deviceId }) => {
          const isShown = !hiddenDeviceIds.includes(deviceId);

          return (
            <button
              aria-pressed={isShown}
              className="flex items-center justify-between gap-3 py-1 text-left text-sm"
              key={deviceId}
              onClick={() => {
                setIsShown(deviceId, !isShown);
              }}
              type="button"
            >
              <span className={isShown ? '' : 'text-muted'}>{alias}</span>
              <ToggleSwitch isOn={isShown} />
            </button>
          );
        })
      )}
    </fieldset>
  );
}
