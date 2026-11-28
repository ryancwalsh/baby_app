'use client';

import { useEffect, useState } from 'react';

import { deleteDiaperAction, getDiaperAction, saveDiaperAction } from '@/app/actions/tracking';
import { TILE_COLORS } from '@/components/tile-styles';
import { DateTimeField, NoteField } from '@/components/tracking-fields';
import { TrackingForm } from '@/components/tracking-form';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/components/tracking-format';
import { DEFAULT_DIAPER_KIND, DIAPER_KINDS, type DiaperKind } from '@/storage/tracking-types';

export function DiaperForm({ id, secretHash }: { readonly id: null | number; readonly secretHash: string }) {
  const [changedAt, setChangedAt] = useState(() => toDateTimeInputValue(Date.now()));
  const [kind, setKind] = useState<DiaperKind>(DEFAULT_DIAPER_KIND);
  const [note, setNote] = useState('');
  const [isLoaded, setIsLoaded] = useState(id === null);

  useEffect(() => {
    async function load(diaperId: number) {
      const diaper = await getDiaperAction(secretHash, diaperId);
      if (diaper !== null) {
        setChangedAt(toDateTimeInputValue(diaper.changedAt));
        setKind(diaper.kind);
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
      onSave={async () => saveDiaperAction(secretHash, id, { changedAt: fromDateTimeInputValue(changedAt) ?? '', kind, note })}
      title="Diaper"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted mb-1 text-sm">Kind</legend>
        <div className="flex gap-2">
          {DIAPER_KINDS.map(({ kind: option, label }) => (
            <button
              aria-pressed={kind === option}
              className={`rounded-lg border px-4 py-2 text-base ${kind === option ? 'border-accent/60 text-accent' : 'border-foreground/15 text-muted'}`}
              key={option}
              onClick={() => {
                setKind(option);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <DateTimeField label="Time" onChange={setChangedAt} value={changedAt} />
      <NoteField onChange={setNote} value={note} />
    </TrackingForm>
  );
}
