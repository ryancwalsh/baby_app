'use client';

import { useEffect, useRef } from 'react';

import { formatDate } from '@/components/tracking-format';

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

/**
 * The day calendar's row of days, scrolled sideways, oldest on the left and today on the right.
 */
export function DateStrip({
  dayStarts,
  onSelect,
  selectedDayStart,
}: {
  readonly dayStarts: number[];
  readonly onSelect: (dayStart: number) => void;
  readonly selectedDayStart: number;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  /**
   * Opens with the chosen day in view, which is today at the right-hand edge unless the page was opened on another day. It runs again when the log arrives and the strip grows to the left.
   */
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [dayStarts.length]);

  return (
    <div className="-mx-6 flex overflow-x-auto px-6 [scrollbar-width:none]">
      {/* The automatic margin keeps a short strip against the right-hand edge, where today belongs, without cutting off the start of a long one the way `justify-end` would. */}
      <div className="ml-auto flex gap-1">
        {dayStarts.map((dayStart) => {
          const isSelected = dayStart === selectedDayStart;
          const date = new Date(dayStart);

          return (
            <button
              aria-label={formatDate(dayStart, 'iso-weekday')}
              aria-pressed={isSelected}
              className={`flex w-11 shrink-0 flex-col items-center rounded-lg border py-1.5 ${isSelected ? 'border-amber-500/60 text-amber-500' : 'text-foreground/60 border-transparent'}`}
              key={dayStart}
              onClick={() => {
                onSelect(dayStart);
              }}
              ref={isSelected ? selectedRef : undefined}
              type="button"
            >
              <span className="text-[10px] uppercase">{WEEKDAY_FORMAT.format(date)}</span>
              <span className="text-base tabular-nums">{date.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
