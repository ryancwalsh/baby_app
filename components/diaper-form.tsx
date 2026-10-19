'use client';

import { useEffect, useState } from 'react';

import { deleteDiaperAction, getDiaperAction, saveDiaperAction } from '@/app/actions/tracking';
import { TILE_COLORS } from '@/components/track-tiles';
import { DateTimeField, NoteField } from '@/components/tracking-fields';
import { TrackingForm } from '@/components/tracking-form';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/components/tracking-format';

export function DiaperForm({ id, secretHash }: { readonly id: null | number; readonly secretHash: string }) {
  const [changedAt, setChangedAt] = useState(() => toDateTimeInputValue(Date.now()));
  const [note, setNote] = useState('');
  const [isLoaded, setIsLoaded] = useState(id === null);

  useEffect(() => {
    async function load(diaperId: number) {
      const diaper = await getDiaperAction(secretHash, diaperId);
      if (diaper !== null) {
        setChangedAt(toDateTimeInputValue(diaper.changedAt));
        setNote(diaper.note);
      }

      setIsLoaded(true);
    }

    if (id !== null) {
      load(id);
    }
  }, [id, secretHash]);

  return (
    <TrackingForm
      colorClassName={TILE_COLORS.diaper.label}
      isEditing={id !== null}
      isLoaded={isLoaded}
      onDelete={async () => deleteDiaperAction(secretHash, id ?? 0)}
      onSave={async () => saveDiaperAction(secretHash, id, { changedAt: fromDateTimeInputValue(changedAt) ?? '', note })}
      title="Diaper"
    >
      <DateTimeField label="Time" onChange={setChangedAt} value={changedAt} />
      <NoteField onChange={setNote} value={note} />
    </TrackingForm>
  );
}
