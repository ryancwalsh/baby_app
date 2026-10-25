'use client';

import { XIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { formatClockTime, formatDate, toDateTimeInputValue } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useDateFormat } from '@/hooks/use-date-format';

export const INPUT_CLASS_NAME = 'border-foreground/15 bg-background w-full rounded-lg border px-3 py-2 text-base';

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
      <span className="text-muted">{label}</span>
      <div className="flex gap-2">
        <div className="relative w-full">
          <span className={`${INPUT_CLASS_NAME} block tabular-nums ${isOptional ? 'pr-8' : ''} ${value === '' ? 'text-faint' : ''}`}>{readout}</span>
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
          {isOptional && value !== '' && (
            <ClearButton
              onClear={() => {
                onChange('');
              }}
            />
          )}
        </div>
        <button
          className="border-foreground/15 text-muted rounded-lg border px-3 text-sm"
          onClick={() => {
            onChange(toDateTimeInputValue(Date.now()));
          }}
          type="button"
        >
          Now
        </button>
      </div>
    </label>
  );
}

/**
 * An X inside the right edge of a field that has something in it, which empties it.
 */
function Clearable({ children, onClear, value }: { readonly children: ReactNode; readonly onClear: () => void; readonly value: string }) {
  return (
    <div className="relative">
      {children}
      {value !== '' && <ClearButton onClear={onClear} />}
    </div>
  );
}

/**
 * The X itself, laid over the right edge of a field that has room left for it.
 */
function ClearButton({ onClear }: { readonly onClear: () => void }) {
  return (
    <button aria-label="Clear" className="text-faint absolute top-0 right-0 flex h-full items-start p-2.5" onClick={onClear} type="button">
      <XIcon className="size-4" />
    </button>
  );
}

/**
 * Whole ml unless `allowsDecimals`, which a medicine dose such as 2.5 ml needs.
 */
export function MillilitersField({
  allowsDecimals = false,
  isOptional = false,
  label,
  onChange,
  value,
}: {
  readonly allowsDecimals?: boolean;
  readonly isOptional?: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="flex w-28 flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <Clearable
        onClear={() => {
          onChange('');
        }}
        value={value}
      >
        <input
          className={`${INPUT_CLASS_NAME} pr-8 tabular-nums`}
          inputMode={allowsDecimals ? 'decimal' : 'numeric'}
          min={0}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          required={!isOptional}
          step={allowsDecimals ? 'any' : 1}
          type="number"
          value={value}
        />
      </Clearable>
    </label>
  );
}

export function NoteField({ onChange, value }: { readonly onChange: (value: string) => void; readonly value: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">Note</span>
      <Clearable
        onClear={() => {
          onChange('');
        }}
        value={value}
      >
        <textarea
          className={`${INPUT_CLASS_NAME} block pr-8`}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          rows={2}
          value={value}
        />
      </Clearable>
    </label>
  );
}

export function toOptionalMilliliters(value: string): null | number {
  return value.trim() === '' ? null : Number(value);
}
