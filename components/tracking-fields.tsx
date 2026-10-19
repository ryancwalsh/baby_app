'use client';

import { formatClockTime, formatDate, toDateTimeInputValue } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useDateFormat } from '@/hooks/use-date-format';

const INPUT_CLASS_NAME = 'border-foreground/15 bg-background w-full rounded-lg border px-3 py-2 text-base';

/**
 * A native `datetime-local` input shows the time however the browser's locale likes, ignoring the clock and date formats chosen in settings. So the input is laid invisibly over a readout in those formats, and a tap still opens the native picker.
 */
export function DateTimeField({
  isOptional = false,
  label,
  onChange,
  value,
}: {
  readonly isOptional?: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const { is24Hour } = useClockFormat();
  const { dateFormat } = useDateFormat();
  const readout = value === '' ? 'Not set' : `${formatDate(new Date(value).getTime(), dateFormat)} ${formatClockTime(value, is24Hour)}`;

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-foreground/60">
        {label}
        {isOptional && ' (optional)'}
      </span>
      <div className="flex gap-2">
        <div className="relative w-full">
          <span className={`${INPUT_CLASS_NAME} block tabular-nums ${value === '' ? 'text-foreground/40' : ''}`}>{readout}</span>
          <input
            className="absolute inset-0 size-full opacity-0"
            onChange={(event) => {
              onChange(event.target.value);
            }}
            onClick={(event) => {
              event.currentTarget.showPicker();
            }}
            required={!isOptional}
            type="datetime-local"
            value={value}
          />
        </div>
        <button
          className="border-foreground/15 text-foreground/60 rounded-lg border px-3 text-sm"
          onClick={() => {
            onChange(toDateTimeInputValue(Date.now()));
          }}
          type="button"
        >
          Now
        </button>
        {isOptional && value !== '' && (
          <button
            className="border-foreground/15 text-foreground/60 rounded-lg border px-3 text-sm"
            onClick={() => {
              onChange('');
            }}
            type="button"
          >
            Clear
          </button>
        )}
      </div>
    </label>
  );
}

export function MillilitersField({
  isOptional = false,
  label,
  onChange,
  value,
}: {
  readonly isOptional?: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-foreground/60">
        {label} (ml){isOptional && ' (optional)'}
      </span>
      <input
        className={INPUT_CLASS_NAME}
        inputMode="numeric"
        min={0}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        required={!isOptional}
        step={1}
        type="number"
        value={value}
      />
    </label>
  );
}

export function NoteField({ onChange, value }: { readonly onChange: (value: string) => void; readonly value: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-foreground/60">Note (optional)</span>
      <textarea
        className={INPUT_CLASS_NAME}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        rows={2}
        value={value}
      />
    </label>
  );
}

export function toOptionalMilliliters(value: string): null | number {
  return value.trim() === '' ? null : Number(value);
}
