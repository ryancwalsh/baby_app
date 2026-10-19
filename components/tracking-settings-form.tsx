'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getTrackingSettingsAction, saveTrackingSettingsAction } from '@/app/actions/tracking';
import { useClockFormat } from '@/hooks/use-clock-format';
import { PREDICTION_METHODS, type PredictionMethod, type TrackingSettings } from '@/storage/tracking-types';

const METHOD_LABELS: Record<PredictionMethod, string> = {
  age: 'Typical for his age',
  fixed: 'The wake windows below',
  learned: 'Learned from the past two weeks',
};

const INPUT_CLASS_NAME = 'border-foreground/15 bg-background rounded-lg border px-3 py-2 text-base';

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
 * The prediction settings are shared by every phone, so they live in the database; the clock format is per phone and lives in local storage, and changes the moment it is tapped.
 */
export function TrackingSettingsForm({ secretHash }: { readonly secretHash: string }) {
  const router = useRouter();
  const { is24Hour, setIs24Hour } = useClockFormat();
  const [method, setMethod] = useState<PredictionMethod>('fixed');
  const [birthDate, setBirthDate] = useState('');
  const [twoNap, setTwoNap] = useState<string[]>([]);
  const [threeNap, setThreeNap] = useState<string[]>([]);
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
      setIsLoaded(true);
    }

    load();
  }, [secretHash]);

  async function save() {
    const settings: TrackingSettings = {
      birthDate: birthDate === '' ? null : birthDate,
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
      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground/60 mb-1 text-sm">Clock on this phone</legend>
        <div className="flex gap-2">
          {[false, true].map((option) => (
            <button
              className={`rounded-lg border px-4 py-2 text-sm ${is24Hour === option ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'}`}
              key={String(option)}
              onClick={() => {
                setIs24Hour(option);
              }}
              type="button"
            >
              {option ? '24-hour' : '12-hour'}
            </button>
          ))}
        </div>
      </fieldset>

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
            <input
              className={INPUT_CLASS_NAME}
              onChange={(event) => {
                setBirthDate(event.target.value);
              }}
              required={method === 'age'}
              type="date"
              value={birthDate}
            />
          </label>

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
