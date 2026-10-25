'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { deleteMedicineAction, getMedicineAction, listMedicineNamesAction, saveMedicineAction } from '@/app/actions/tracking';
import { TILE_COLORS } from '@/components/tile-styles';
import { DateTimeField, INPUT_CLASS_NAME, MillilitersField, NoteField } from '@/components/tracking-fields';
import { TrackingForm } from '@/components/tracking-form';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/components/tracking-format';

const MEDICINE_NAMES_LIST_ID = 'medicine-names';

/**
 * Editing loads the whole entry. `?repeat=` loads only the medicine and amount of that entry, and keeps the time as now and the note empty, so the same dose can be logged again in one tap.
 */
export function MedicineForm({ id, secretHash }: { readonly id: null | number; readonly secretHash: string }) {
  const searchParameters = useSearchParams();
  const repeatParameter = searchParameters.get('repeat');
  const repeatId = repeatParameter === null ? Number.NaN : Number.parseInt(repeatParameter, 10);
  const sourceId = id ?? (Number.isNaN(repeatId) ? null : repeatId);
  const [givenAt, setGivenAt] = useState(() => toDateTimeInputValue(Date.now()));
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(sourceId === null);

  useEffect(() => {
    async function loadNames() {
      setNames(await listMedicineNamesAction(secretHash));
    }

    loadNames();
  }, [secretHash]);

  useEffect(() => {
    async function load(medicineId: number) {
      const medicine = await getMedicineAction(secretHash, medicineId);
      if (medicine !== null) {
        if (id !== null) {
          setGivenAt(toDateTimeInputValue(medicine.givenAt));
          setNote(medicine.note);
        }

        setName(medicine.name);
        setAmount(String(medicine.amountMilliliters));
      }

      setIsLoaded(true);
    }

    if (sourceId !== null) {
      load(sourceId);
    }
  }, [id, secretHash, sourceId]);

  return (
    <TrackingForm
      colorClassName={TILE_COLORS.medicine.label}
      isEditing={id !== null}
      isLoaded={isLoaded}
      onDelete={async () => deleteMedicineAction(secretHash, id ?? 0)}
      onSave={async () => saveMedicineAction(secretHash, id, { amountMilliliters: Number(amount), givenAt: fromDateTimeInputValue(givenAt) ?? '', name, note })}
      title="Medicine"
    >
      <DateTimeField label="Time" onChange={setGivenAt} value={givenAt} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Medicine</span>
        {/* A datalist suggests what has been given before, and still takes any new name typed in. */}
        <input
          autoCapitalize="words"
          className={INPUT_CLASS_NAME}
          list={MEDICINE_NAMES_LIST_ID}
          onChange={(event) => {
            setName(event.target.value);
          }}
          required
          value={name}
        />
        <datalist id={MEDICINE_NAMES_LIST_ID}>
          {names.map((medicineName) => (
            <option key={medicineName} value={medicineName} />
          ))}
        </datalist>
      </label>
      <MillilitersField allowsDecimals label="Amount (ml)" onChange={setAmount} value={amount} />
      <NoteField onChange={setNote} value={note} />
    </TrackingForm>
  );
}
