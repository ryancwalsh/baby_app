'use client';

import { DATE_FORMATS, formatDate } from '@/components/tracking-format';
import { useBottleInterval } from '@/hooks/use-bottle-interval';
import { BOTTLE_TIMES, useBottleTime } from '@/hooks/use-bottle-time';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useDateFormat } from '@/hooks/use-date-format';
import { TEXT_SIZES, type TextSize, useFormTextSize, useLogTextSize, useTileTextSize } from '@/hooks/use-text-size';
import { THEMES, useTheme } from '@/hooks/use-theme';
import { TRACKING_VIEWS, useTrackingView } from '@/hooks/use-tracking-view';

/**
 * Each choice is shown at its own size, so the buttons are a preview.
 */
function TextSizeChoice({ legend, onChange, textSize }: { readonly legend: string; readonly onChange: (next: TextSize) => void; readonly textSize: TextSize }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-foreground/60 mb-1 text-sm">{legend}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {TEXT_SIZES.map(({ label, size: option, zoom }) => (
          <button
            className={`rounded-lg border px-4 py-2 text-sm ${textSize === option ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'}`}
            key={option}
            onClick={() => {
              onChange(option);
            }}
            style={{ zoom }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The settings that are about whoever is holding the phone rather than about the baby: the theme, the clock and date formats, the text size on the tiles, on the forms, and in the tracking list, what the notepad button opens, which time places a bottle in the log, and how long after one bottle the next is due. They live in local storage and change the moment they are tapped.
 */
export function PhoneSettings() {
  const { is24Hour, setIs24Hour } = useClockFormat();
  const { dateFormat, setDateFormat } = useDateFormat();
  const tileTextSize = useTileTextSize();
  const formTextSize = useFormTextSize();
  const logTextSize = useLogTextSize();
  const { setTheme, theme } = useTheme();
  const { setTrackingView, trackingView } = useTrackingView();
  const { bottleTimeBasis, setBottleTimeBasis } = useBottleTime();
  const { bottleIntervalMinutes, setBottleIntervalMinutes } = useBottleInterval();

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground/60 mb-1 text-sm">Theme on this phone</legend>
        <div className="flex gap-2">
          {THEMES.map(({ label, theme: option }) => (
            <button
              className={`rounded-lg border px-4 py-2 text-sm ${theme === option ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'}`}
              key={option}
              onClick={() => {
                setTheme(option);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground/60 mb-1 text-sm">Clock on this phone</legend>
        <div className="flex gap-2">
          {[false, true].map((option) => (
            <button
              className={`rounded-lg border px-4 py-2 text-sm ${is24Hour === option ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'}`}
              key={String(option)}
              onClick={() => {
                setIs24Hour(option);
              }}
              type="button"
            >
              {option ? '24-hour' : '12-hour'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground/60 mb-1 text-sm">Dates on this phone</legend>
        <div className="flex flex-wrap gap-2">
          {DATE_FORMATS.map((option) => (
            <button
              className={`rounded-lg border px-4 py-2 text-sm tabular-nums ${dateFormat === option ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'}`}
              key={option}
              onClick={() => {
                setDateFormat(option);
              }}
              type="button"
            >
              {formatDate(Date.now(), option)}
            </button>
          ))}
        </div>
      </fieldset>

      <TextSizeChoice
        legend="Tile text on this phone"
        onChange={(next) => {
          tileTextSize.setTextSize(next);
        }}
        textSize={tileTextSize.textSize}
      />

      <TextSizeChoice
        legend="Add and edit pages' text on this phone"
        onChange={(next) => {
          formTextSize.setTextSize(next);
        }}
        textSize={formTextSize.textSize}
      />

      <TextSizeChoice
        legend="Tracking list text on this phone"
        onChange={(next) => {
          logTextSize.setTextSize(next);
        }}
        textSize={logTextSize.textSize}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground/60 mb-1 text-sm">Notepad button on this phone opens</legend>
        <div className="flex flex-wrap gap-2">
          {TRACKING_VIEWS.map(({ label, view: option }) => (
            <button
              className={`rounded-lg border px-4 py-2 text-sm ${trackingView === option ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'}`}
              key={option}
              onClick={() => {
                setTrackingView(option);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground/60 mb-1 text-sm">Bottles in the log on this phone are placed at</legend>
        <div className="flex flex-wrap gap-2">
          {BOTTLE_TIMES.map(({ basis: option, label }) => (
            <button
              className={`rounded-lg border px-4 py-2 text-sm ${bottleTimeBasis === option ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'}`}
              key={option}
              onClick={() => {
                setBottleTimeBasis(option);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2 text-sm">
        <span className="text-foreground/60">Minutes between bottles on this phone</span>
        <input
          className="border-foreground/15 bg-background w-28 rounded-lg border px-3 py-2 text-base tabular-nums"
          defaultValue={bottleIntervalMinutes}
          inputMode="numeric"
          min={1}
          onChange={(event) => {
            const minutes = Number(event.target.value);
            if (Number.isInteger(minutes) && minutes > 0) {
              setBottleIntervalMinutes(minutes);
            }
          }}
          step={1}
          type="number"
        />
      </label>
    </>
  );
}
