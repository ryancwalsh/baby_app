'use client';

import { MinusIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';

import { getThermostatSettingsAction, saveCribRangeAction, type ThermostatSettings } from '@/app/actions/thermostat';
import { NanitTemperature } from '@/components/nanit-temperature';
import { formatClockTime } from '@/components/tracking-format';
import { readThermostat } from '@/components/worker-client';
import { useClockFormat } from '@/hooks/use-clock-format';
import { type ThermostatState } from '@/services/ecobee/thermostat';
import { type ThermostatDecisionRecord } from '@/storage/thermostat';

/**
 * How often the hallway is read while the page is open. The thermostat reports in tenths of a degree, and a room does not move faster than this.
 */
const REFRESH_MILLISECONDS = 30_000;
/**
 * What the range controls start from before anyone has set one, in °F.
 */
const DEFAULT_RANGE_FAHRENHEIT = { high: 72, low: 68 };

function toFahrenheit(celsius: number) {
  return Math.round((celsius * 9) / 5 + 32);
}

function toCelsius(fahrenheit: number) {
  return ((fahrenheit - 32) * 5) / 9;
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

function describeDecision(decision: ThermostatDecisionRecord) {
  const setpoints = [decision.proposedHeatCelsius, decision.proposedCoolCelsius].filter((celsius) => celsius !== null).map((celsius) => toFahrenheit(celsius));
  let description = decision.outcome;
  if (decision.outcome === 'would change') {
    description = `would set ${setpoints.join('–')}°F`;
  } else if (decision.outcome === 'would leave') {
    description = 'would leave it as it is';
  } else if (decision.outcome === 'changed') {
    description = `set ${setpoints.join('–')}°F`;
  }

  return description;
}

const ACTIVITY_LABELS: Record<ThermostatState['activity'], string> = { cooling: 'Cooling now', heating: 'Heating now', idle: 'Idle' };

function Stepper({ label, onChange, value }: { readonly label: string; readonly onChange: (value: number) => void; readonly value: number }) {
  return (
    <div className="flex items-center gap-2">
      <button aria-label={`Lower the ${label}`} className="border-foreground/20 rounded-lg border p-2" onClick={() => onChange(value - 1)} type="button">
        <MinusIcon className="size-8" />
      </button>
      <span className="w-16 text-center text-5xl tabular-nums">{value}</span>
      <button aria-label={`Raise the ${label}`} className="border-foreground/20 rounded-lg border p-2" onClick={() => onChange(value + 1)} type="button">
        <PlusIcon className="size-8" />
      </button>
    </div>
  );
}

/**
 * One half of the page, with its device's name down the left edge, read from bottom to top.
 */
function Half({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <section aria-label={label} className="border-foreground/20 relative flex min-h-0 flex-1 items-stretch border-b last:border-b-0">
      <h2 className="text-muted flex rotate-180 items-center justify-center px-2 text-5xl [writing-mode:vertical-rl]">{label}</h2>
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-4 text-center">{children}</div>
    </section>
  );
}

/**
 * The `/thermostat` page, reached by tapping the nursery's temperature on the Switches tab: the crib's temperature and the crib range the worker steers toward, above the hallway thermostat's reading, the range it is holding, and the worker's latest decision. The thermostat is read only while the page is open, and only read here; the worker's loop is what writes to it, during the active hours set on the Settings page.
 */
export function ThermostatPanel({ secretHash }: { readonly secretHash: string }) {
  const [thermostat, setThermostat] = useState<null | ThermostatState>(null);
  const [error, setError] = useState<null | string>(null);
  const [settings, setSettings] = useState<null | ThermostatSettings>(null);
  const [rangeError, setRangeError] = useState<null | string>(null);
  const { is24Hour } = useClockFormat();

  useEffect(() => {
    let isCurrent = true;

    async function loadThermostat() {
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

    async function loadSettings() {
      try {
        const loaded = await getThermostatSettingsAction(secretHash);
        if (isCurrent) {
          setSettings(loaded);
        }
      } catch (caughtError) {
        if (isCurrent) {
          setRangeError(caughtError instanceof Error ? caughtError.message : 'Could not load the crib range.');
        }
      }
    }

    function load() {
      loadThermostat();
      loadSettings();
    }

    load();
    const interval = window.setInterval(load, REFRESH_MILLISECONDS);

    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [secretHash]);

  const rangeFahrenheit =
    settings?.cribRange === null || settings === null
      ? DEFAULT_RANGE_FAHRENHEIT
      : { high: toFahrenheit(settings.cribRange.highCelsius), low: toFahrenheit(settings.cribRange.lowCelsius) };

  async function changeRange(lowFahrenheit: number, highFahrenheit: number) {
    if (settings !== null) {
      const cribRange = { highCelsius: toCelsius(highFahrenheit), lowCelsius: toCelsius(lowFahrenheit) };
      const result = await saveCribRangeAction(secretHash, cribRange);
      setRangeError(result.error);
      if (result.error === null) {
        setSettings({ ...settings, cribRange });
      }
    }
  }

  return (
    /**
     * As tall as the screen above the bottom navigation, roughly, so the two halves split the view the way the dialog this replaced did.
     */
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      <Half label="Nanit">
        <div className="border-foreground/30 rounded-3xl border-2 px-8 py-3">
          <NanitTemperature isLarge secretHash={secretHash} />
        </div>
        <h3 className="text-muted text-3xl">Crib range (°F)</h3>
        {settings === null ? (
          <p className="text-muted text-3xl">{rangeError ?? 'Loading…'}</p>
        ) : (
          <>
            <div className="flex flex-col items-center gap-1">
              <Stepper label="low end" onChange={(low) => changeRange(low, rangeFahrenheit.high)} value={rangeFahrenheit.low} />
              <span className="text-muted text-3xl">to</span>
              <Stepper label="high end" onChange={(high) => changeRange(rangeFahrenheit.low, high)} value={rangeFahrenheit.high} />
            </div>
            {settings.cribRange === null && <p className="text-muted text-3xl">Not set yet. Tap − or + to set it.</p>}
            {rangeError !== null && <p className="text-accent text-3xl">{rangeError}</p>}
          </>
        )}
        <Link className="text-faint absolute bottom-1 left-1/2 -translate-x-1/2 text-xs underline" href="/thermostat/log">
          log
        </Link>
      </Half>
      <Half label="Ecobee">
        {thermostat === null ? (
          <p className="text-muted text-3xl">{error ?? 'Reading the thermostat…'}</p>
        ) : (
          <>
            <p className="text-5xl tabular-nums opacity-70">{toFahrenheit(thermostat.currentCelsius)}°F</p>
            <p className="text-muted text-3xl tabular-nums">{describeTarget(thermostat.target)}</p>
            <p className="text-muted text-3xl">{ACTIVITY_LABELS[thermostat.activity]}</p>
            {error !== null && <p className="text-accent text-3xl">{error}</p>}
          </>
        )}
        {settings !== null && settings.latestDecision !== null && (
          <p className="text-muted text-3xl">
            {settings.latestDecision.outcome.startsWith('would') ? 'Trial run' : 'Nanit control'}, {formatClockTime(settings.latestDecision.decidedAt, is24Hour)}:{' '}
            {describeDecision(settings.latestDecision)}.
          </p>
        )}
      </Half>
    </div>
  );
}
