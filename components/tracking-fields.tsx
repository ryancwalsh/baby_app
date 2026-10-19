'use client';

import { toDateTimeInputValue } from '@/components/tracking-format';

const INPUT_CLASS_NAME = 'border-foreground/15 bg-background w-full rounded-lg border px-3 py-2 text-base';

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
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-foreground/60">
        {label}
        {isOptional && ' (optional)'}
      </span>
      <div className="flex gap-2">
        <input
          className={INPUT_CLASS_NAME}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          required={!isOptional}
          type="datetime-local"
          value={value}
        />
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
