'use client';

import { XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { NanitTemperature } from '@/components/nanit-temperature';
import { readThermostat } from '@/components/worker-client';
import { type ThermostatState } from '@/services/ecobee/thermostat';

/**
 * How often the hallway is read while the dialog is open. The thermostat reports in tenths of a degree, and a room does not move faster than this.
 */
const REFRESH_MILLISECONDS = 30_000;

function toFahrenheit(celsius: number) {
  return Math.round((celsius * 9) / 5 + 32);
}

function describeTarget(target: ThermostatState['target']) {
  let description = 'Off';
  if (target.mode === 'auto') {
    description = `${toFahrenheit(target.heatCelsius)}–${toFahrenheit(target.coolCelsius)}°F`;
  } else if (target.mode === 'heat') {
    description = `Heat to ${toFahrenheit(target.celsius)}°F`;
  } else if (target.mode === 'cool') {
    description = `Cool to ${toFahrenheit(target.celsius)}°F`;
  }

  return description;
}

const ACTIVITY_LABELS: Record<ThermostatState['activity'], string> = { cooling: 'Cooling now', heating: 'Heating now', idle: 'Idle' };

/**
 * The nursery's temperature on the Switches tab, which opens a dialog beside the hallway thermostat's: its reading and the range it is holding. The thermostat is read only while the dialog is open, and only read; nothing here writes to it.
 */
export function TemperatureDialog({ secretHash }: { readonly secretHash: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [thermostat, setThermostat] = useState<null | ThermostatState>(null);
  const [error, setError] = useState<null | string>(null);

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      try {
        const state = await readThermostat(secretHash);
        if (isCurrent) {
          setThermostat(state);
          setError(null);
        }
      } catch (caughtError) {
        if (isCurrent) {
          setError(caughtError instanceof Error ? caughtError.message : 'Could not reach the thermostat.');
        }
      }
    }

    let interval: number | undefined;
    if (isOpen) {
      load();
      interval = window.setInterval(load, REFRESH_MILLISECONDS);
    }

    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [isOpen, secretHash]);

  function open() {
    setThermostat(null);
    setError(null);
    setIsOpen(true);
    dialog.current?.showModal();
  }

  return (
    <>
      <button aria-label="Show the nursery and hallway temperatures" onClick={open} type="button">
        <NanitTemperature secretHash={secretHash} />
      </button>
      <dialog
        aria-label="Temperatures"
        className="bg-background text-foreground m-auto w-[95vw] max-w-md rounded-xl backdrop:bg-black/70"
        onClose={() => setIsOpen(false)}
        ref={dialog}
      >
        <div className="flex flex-col gap-6 p-4">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold">Temperatures</h2>
            <button aria-label="Close" className="text-muted ml-auto p-2" onClick={() => dialog.current?.close()} type="button">
              <XIcon className="size-6" />
            </button>
          </div>

          <section className="flex flex-col items-center gap-1">
            <h3 className="text-muted text-sm">Crib (Nanit)</h3>
            {isOpen && <NanitTemperature isLarge secretHash={secretHash} />}
          </section>

          <section className="flex flex-col items-center gap-1">
            <h3 className="text-muted text-sm">Hallway (ecobee)</h3>
            {thermostat === null ? (
              <p className="text-muted text-base">{error ?? 'Reading the thermostat…'}</p>
            ) : (
              <>
                <p className="text-6xl tabular-nums opacity-70">{toFahrenheit(thermostat.currentCelsius)}°F</p>
                <p className="text-2xl tabular-nums">{describeTarget(thermostat.target)}</p>
                <p className="text-muted text-sm">{ACTIVITY_LABELS[thermostat.activity]}</p>
                {error !== null && <p className="text-accent text-sm">{error}</p>}
              </>
            )}
          </section>
        </div>
      </dialog>
    </>
  );
}
