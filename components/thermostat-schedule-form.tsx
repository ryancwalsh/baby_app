'use client';

import { ArrowRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getThermostatScheduleAction, saveThermostatScheduleAction } from '@/app/actions/thermostat';
import { TimeOfDayField } from '@/components/time-of-day-field';
import { ToggleSwitch } from '@/components/toggle-switch';
import { type ThermostatSchedule } from '@/storage/thermostat';

/**
 * When the worker may steer the hallway ecobee from the Nanit's temperature, shared by every phone. Outside these hours, or switched off, it only logs what it would do, and the ecobee follows its own schedule.
 */
export function ThermostatScheduleForm({ secretHash }: { readonly secretHash: string }) {
  const [schedule, setSchedule] = useState<null | ThermostatSchedule>(null);
  const [error, setError] = useState<null | string>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setSchedule(await getThermostatScheduleAction(secretHash));
      } catch {
        setError('Could not load the thermostat hours.');
      }
    }

    load();
  }, [secretHash]);

  async function save(next: ThermostatSchedule) {
    setSchedule(next);
    setIsSaved(false);
    setIsBusy(true);
    try {
      const result = await saveThermostatScheduleAction(secretHash, next);
      setError(result.error);
      setIsSaved(result.error === null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted text-sm">Nanit temperature controls the Ecobee</h2>
      {schedule === null ? (
        <p className="text-muted text-sm">{error ?? 'Loading…'}</p>
      ) : (
        <>
          <button
            aria-pressed={schedule.isEnabled}
            className="flex items-center justify-between gap-3 text-sm"
            disabled={isBusy}
            onClick={() => save({ ...schedule, isEnabled: !schedule.isEnabled })}
            type="button"
          >
            <span>{schedule.isEnabled ? 'On during these hours' : 'Off: the Ecobee follows its own schedule'}</span>
            <ToggleSwitch isOn={schedule.isEnabled} />
          </button>
          <div className="flex items-start gap-3">
            <TimeOfDayField label="From" onChange={(activeFrom) => save({ ...schedule, activeFrom })} value={schedule.activeFrom} />
            <ArrowRightIcon className="text-faint mt-2.5 size-5 shrink-0" />
            <TimeOfDayField label="Until" onChange={(activeUntil) => save({ ...schedule, activeUntil })} value={schedule.activeUntil} />
          </div>
          <p className="text-faint text-xs">
            Checked every 10 minutes, moving the Ecobee about 1°F at a time. Outside these hours the Ecobee follows its own schedule. A change made at the thermostat or in the
            Ecobee app wins until these hours next end. Saved as you change it.
          </p>
          {error !== null && <p className="text-accent text-sm">{error}</p>}
          {isSaved && <p className="text-muted text-sm">Saved.</p>}
        </>
      )}
    </section>
  );
}
