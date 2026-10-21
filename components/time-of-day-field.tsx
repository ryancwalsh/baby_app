'use client';

import { formatClockTime } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';

export const INPUT_CLASS_NAME = 'border-foreground/15 bg-background rounded-lg border px-3 py-2 text-base';

/**
 * A native `time` input laid invisibly over a readout in the clock format chosen above, as the birth date is.
 */
export function TimeOfDayField({ label, onChange, value }: { readonly label: string; readonly onChange: (value: string) => void; readonly value: string }) {
  const { is24Hour } = useClockFormat();

  return (
    <label className="flex flex-1 flex-col gap-1 text-sm">
      <div className="relative">
        <span className={`${INPUT_CLASS_NAME} block tabular-nums`}>{formatClockTime(new Date(`2000-01-01T${value}`), is24Hour)}</span>
        <input
          className="absolute inset-0 size-full opacity-0"
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onClick={(event) => {
            event.currentTarget.showPicker();
          }}
          required
          type="time"
          value={value}
        />
      </div>
      <span className="text-foreground/60 text-xs uppercase">{label}</span>
    </label>
  );
}
