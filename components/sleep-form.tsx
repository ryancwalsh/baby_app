'use client';

import { useEffect, useState } from 'react';

import { deleteSleepAction, getSleepAction, saveSleepAction } from '@/app/actions/tracking';
import { TILE_COLORS } from '@/components/track-tiles';
import { DateTimeField, NoteField } from '@/components/tracking-fields';
import { TrackingForm } from '@/components/tracking-form';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/components/tracking-format';

/**
 * Leaving the end empty saves a sleep that is still going on.
 */
export function SleepForm({ id, secretHash }: { readonly id: null | number; readonly secretHash: string }) {
  const [startedAt, setStartedAt] = useState(() => toDateTimeInputValue(Date.now()));
  const [endedAt, setEndedAt] = useState('');
  const [note, setNote] = useState('');
  const [isLoaded, setIsLoaded] = useState(id === null);

  useEffect(() => {
    async function load(sleepId: number) {
      const sleep = await getSleepAction(secretHash, sleepId);
      if (sleep !== null) {
        setStartedAt(toDateTimeInputValue(sleep.startedAt));
        setEndedAt(sleep.endedAt === null ? '' : toDateTimeInputValue(sleep.endedAt));
        setNote(sleep.note);
      }

      setIsLoaded(true);
    }

    if (id !== null) {
      load(id);
    }
  }, [id, secretHash]);

  return (
    <TrackingForm
      colorClassName={TILE_COLORS.sleep.label}
      isEditing={id !== null}
      isLoaded={isLoaded}
      onDelete={async () => deleteSleepAction(secretHash, id ?? 0)}
      onSave={async () => saveSleepAction(secretHash, id, { endedAt: fromDateTimeInputValue(endedAt), note, startedAt: fromDateTimeInputValue(startedAt) ?? '' })}
      title="Sleep"
    >
      <DateTimeField label="Start" onChange={setStartedAt} value={startedAt} />
      <DateTimeField isOptional label="End" onChange={setEndedAt} value={endedAt} />
      <NoteField onChange={setNote} value={note} />
    </TrackingForm>
  );
}
