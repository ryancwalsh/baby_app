'use client';

import { useEffect, useState } from 'react';

import { deleteBottleAction, getBottleAction, saveBottleAction } from '@/app/actions/tracking';
import { TILE_COLORS } from '@/components/track-tiles';
import { DateTimeField, MillilitersField, NoteField, toOptionalMilliliters } from '@/components/tracking-fields';
import { TrackingForm } from '@/components/tracking-form';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/components/tracking-format';

export function BottleForm({ id, secretHash }: { readonly id: null | number; readonly secretHash: string }) {
  const [preparedAt, setPreparedAt] = useState(() => toDateTimeInputValue(Date.now()));
  const [touchedLipsAt, setTouchedLipsAt] = useState('');
  const [amount, setAmount] = useState('');
  const [drank, setDrank] = useState('');
  const [note, setNote] = useState('');
  const [isLoaded, setIsLoaded] = useState(id === null);

  useEffect(() => {
    async function load(bottleId: number) {
      const bottle = await getBottleAction(secretHash, bottleId);
      if (bottle !== null) {
        setPreparedAt(toDateTimeInputValue(bottle.preparedAt));
        setTouchedLipsAt(bottle.touchedLipsAt === null ? '' : toDateTimeInputValue(bottle.touchedLipsAt));
        setAmount(String(bottle.amountMilliliters));
        setDrank(bottle.drankMilliliters === null ? '' : String(bottle.drankMilliliters));
        setNote(bottle.note);
      }

      setIsLoaded(true);
    }

    if (id !== null) {
      load(id);
    }
  }, [id, secretHash]);

  return (
    <TrackingForm
      colorClassName={TILE_COLORS.bottle.label}
      isEditing={id !== null}
      isLoaded={isLoaded}
      onDelete={async () => deleteBottleAction(secretHash, id ?? 0)}
      onSave={async () =>
        saveBottleAction(secretHash, id, {
          amountMilliliters: Number(amount),
          drankMilliliters: toOptionalMilliliters(drank),
          note,
          preparedAt: fromDateTimeInputValue(preparedAt) ?? '',
          touchedLipsAt: fromDateTimeInputValue(touchedLipsAt),
        })
      }
      title="Bottle"
    >
      <DateTimeField label="Prepared" onChange={setPreparedAt} value={preparedAt} />
      <DateTimeField isOptional label="Touched lips" onChange={setTouchedLipsAt} value={touchedLipsAt} />
      <MillilitersField label="Amount" onChange={setAmount} value={amount} />
      <MillilitersField isOptional label="Drank" onChange={setDrank} value={drank} />
      <NoteField onChange={setNote} value={note} />
    </TrackingForm>
  );
}
