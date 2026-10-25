'use client';

import { useEffect, useState } from 'react';

import { deleteBottleAction, getBottleAction, saveBottleAction } from '@/app/actions/tracking';
import { TILE_COLORS } from '@/components/tile-styles';
import { DateTimeField, MillilitersField, NoteField, toOptionalMilliliters } from '@/components/tracking-fields';
import { TrackingForm } from '@/components/tracking-form';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/components/tracking-format';

/**
 * What is left of the bottle once the part is taken away, or empty when either is. Remaining is never stored: it is only another way of entering how much was drunk.
 */
function getDifference(total: string, part: string): string {
  return total.trim() === '' || part.trim() === '' ? '' : String(Number(total) - Number(part));
}

export function BottleForm({ id, secretHash }: { readonly id: null | number; readonly secretHash: string }) {
  const [preparedAt, setPreparedAt] = useState(() => toDateTimeInputValue(Date.now()));
  const [touchedLipsAt, setTouchedLipsAt] = useState('');
  const [amount, setAmount] = useState('');
  const [remaining, setRemaining] = useState('');
  const [drank, setDrank] = useState('');
  const [note, setNote] = useState('');
  const [isLoaded, setIsLoaded] = useState(id === null);

  useEffect(() => {
    async function load(bottleId: number) {
      const bottle = await getBottleAction(secretHash, bottleId);
      if (bottle !== null) {
        setPreparedAt(toDateTimeInputValue(bottle.preparedAt));
        setTouchedLipsAt(bottle.touchedLipsAt === null ? '' : toDateTimeInputValue(bottle.touchedLipsAt));
        const loadedAmount = bottle.amountMilliliters === null ? '' : String(bottle.amountMilliliters);
        const loadedDrank = bottle.drankMilliliters === null ? '' : String(bottle.drankMilliliters);
        setAmount(loadedAmount);
        setDrank(loadedDrank);
        setRemaining(getDifference(loadedAmount, loadedDrank));
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
          amountMilliliters: toOptionalMilliliters(amount),
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
      <fieldset className="flex flex-col gap-1">
        <legend className="text-muted mb-1 text-sm">Amounts (ml)</legend>
        <div className="flex gap-3">
          <MillilitersField
            isOptional
            label="Prepared"
            onChange={(value) => {
              setAmount(value);
              if (drank !== '') {
                setRemaining(getDifference(value, drank));
              } else if (remaining !== '') {
                setDrank(getDifference(value, remaining));
              }
            }}
            value={amount}
          />
          <MillilitersField
            isOptional
            label="Drank"
            onChange={(value) => {
              setDrank(value);
              if (amount !== '') {
                setRemaining(getDifference(amount, value));
              }
            }}
            value={drank}
          />
          <MillilitersField
            isOptional
            label="Remaining"
            onChange={(value) => {
              setRemaining(value);
              if (amount !== '') {
                setDrank(getDifference(amount, value));
              }
            }}
            value={remaining}
          />
        </div>
      </fieldset>
      <NoteField onChange={setNote} value={note} />
    </TrackingForm>
  );
}
