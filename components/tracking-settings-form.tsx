'use client';

import { ArrowRightIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getTrackingSettingsAction, saveTrackingSettingsAction } from '@/app/actions/tracking';
import { PhoneSettings } from '@/components/phone-settings';
import { INPUT_CLASS_NAME, TimeOfDayField } from '@/components/time-of-day-field';
import { formatDate } from '@/components/tracking-format';
import { useDateFormat } from '@/hooks/use-date-format';
import {
  DAY_TOTALS_FROM,
  type DayTotalsFrom,
  DEFAULT_DAY_ENDS_AT,
  DEFAULT_DAY_STARTS_AT,
  PREDICTION_METHODS,
  type PredictionMethod,
  type TrackingSettings,
} from '@/storage/tracking-types';

const METHOD_LABELS: Record<PredictionMethod, string> = {
  age: 'Typical for his age',
  fixed: 'The wake windows below',
  learned: 'Learned from the past two weeks',
};

const DAY_TOTALS_FROM_LABELS: Record<DayTotalsFrom, string> = {
  'day-start': 'The day start time to the next',
  midnight: 'Midnight to midnight',
};

function WindowFields({ label, onChange, windows }: { readonly label: string; readonly onChange: (windows: string[]) => void; readonly windows: string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-foreground/60 mb-1 text-sm">{label} wake windows (minutes)</legend>
      {windows.map((minutes, index) => (
        // eslint-disable-next-line react/no-array-index-key -- The windows are positions in the day, and never reorder.
        <label className="flex items-center justify-between gap-3 text-sm" key={index}>
          <span>{index === windows.length - 1 ? 'Before bed' : `Before nap ${index + 1}`}</span>
          <input
            className={`${INPUT_CLASS_NAME} w-24`}
            inputMode="numeric"
            min={1}
            onChange={(event) => {
              const next = [...windows];
              next[index] = event.target.value;
              onChange(next);
            }}
            required
            step={1}
            type="number"
            value={minutes}
          />
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The prediction settings are shared by every phone, so they live in the database; the ones in components/phone-settings.tsx are per phone and live in local storage.
 */
export function TrackingSettingsForm({ secretHash }: { readonly secretHash: string }) {
  const router = useRouter();
  const { dateFormat } = useDateFormat();
  const [method, setMethod] = useState<PredictionMethod>('fixed');
  const [birthDate, setBirthDate] = useState('');
  const [twoNap, setTwoNap] = useState<string[]>([]);
  const [threeNap, setThreeNap] = useState<string[]>([]);
  const [dayStartsAt, setDayStartsAt] = useState(DEFAULT_DAY_STARTS_AT);
  const [dayEndsAt, setDayEndsAt] = useState(DEFAULT_DAY_ENDS_AT);
  const [dayTotalsFrom, setDayTotalsFrom] = useState<DayTotalsFrom>('midnight');
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const settings = await getTrackingSettingsAction(secretHash);
      setMethod(settings.predictionMethod);
      setBirthDate(settings.birthDate ?? '');
      setTwoNap(settings.twoNapWakeWindowMinutes.map(String));
      setThreeNap(settings.threeNapWakeWindowMinutes.map(String));
      setDayStartsAt(settings.dayStartsAt);
      setDayEndsAt(settings.dayEndsAt);
      setDayTotalsFrom(settings.dayTotalsFrom);
      setIsLoaded(true);
    }

    load();
  }, [secretHash]);

  async function save() {
    const settings: TrackingSettings = {
      birthDate: birthDate === '' ? null : birthDate,
      dayEndsAt,
      dayStartsAt,
      dayTotalsFrom,
      predictionMethod: method,
      threeNapWakeWindowMinutes: threeNap.map(Number),
      twoNapWakeWindowMinutes: twoNap.map(Number),
    };
    setIsBusy(true);
    try {
      const result = await saveTrackingSettingsAction(secretHash, settings);
      if (result.error === null) {
        router.push('/track');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PhoneSettings />

      {isLoaded ? (
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-foreground/60 mb-1 text-sm">Predict the next sleep from</legend>
            {PREDICTION_METHODS.map((option) => (
              <label className="flex items-center gap-2 text-sm" key={option}>
                <input
                  checked={method === option}
                  className="accent-amber-500"
                  name="method"
                  onChange={() => {
                    setMethod(option);
                  }}
                  type="radio"
                />
                {METHOD_LABELS[option]}
              </label>
            ))}
            <p className="text-foreground/50 text-xs">Learning falls back to the wake windows below for any window it has not seen yet.</p>
          </fieldset>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/60">Birth date{method === 'age' ? '' : ' (only for age)'}</span>
            {/*
              Like the time fields on the tracking forms, the native input is laid invisibly over a readout in the date format chosen above, since the browser would otherwise show its own locale's.
            */}
            <div className="relative">
              <span className={`${INPUT_CLASS_NAME} block tabular-nums ${birthDate === '' ? 'text-foreground/40' : ''}`}>
                {birthDate === '' ? 'Not set' : formatDate(new Date(`${birthDate}T00:00`).getTime(), dateFormat)}
              </span>
              <input
                className="absolute inset-0 size-full opacity-0"
                onChange={(event) => {
                  setBirthDate(event.target.value);
                }}
                onClick={(event) => {
                  event.currentTarget.showPicker();
                }}
                required={method === 'age'}
                type="date"
                value={birthDate}
              />
            </div>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-foreground/60 mb-1 text-sm">Day vs night time start times</legend>
            <p className="text-foreground/50 text-xs">A sleep that starts between these times, and is under 4 hours, counts as a nap. Everything else is night sleep.</p>
            <div className="flex items-start gap-3">
              <TimeOfDayField label="Start" onChange={setDayStartsAt} value={dayStartsAt} />
              <ArrowRightIcon className="text-foreground/40 mt-2.5 size-5 shrink-0" />
              <TimeOfDayField label="End" onChange={setDayEndsAt} value={dayEndsAt} />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-foreground/60 mb-1 text-sm">Count a day&apos;s totals from</legend>
            {DAY_TOTALS_FROM.map((option) => (
              <label className="flex items-center gap-2 text-sm" key={option}>
                <input
                  checked={dayTotalsFrom === option}
                  className="accent-amber-500"
                  name="dayTotalsFrom"
                  onChange={() => {
                    setDayTotalsFrom(option);
                  }}
                  type="radio"
                />
                {DAY_TOTALS_FROM_LABELS[option]}
              </label>
            ))}
          </fieldset>

          <WindowFields label="2-nap day" onChange={setTwoNap} windows={twoNap} />
          <WindowFields label="3-nap day" onChange={setThreeNap} windows={threeNap} />

          {error !== null && <p className="text-sm text-amber-500">{error}</p>}
          <button className="border-foreground/15 self-start rounded-lg border px-4 py-2 font-semibold text-amber-500 disabled:opacity-60" disabled={isBusy} type="submit">
            Save
          </button>
        </form>
      ) : (
        <p className="text-sm opacity-60">Loading…</p>
      )}
    </div>
  );
}
