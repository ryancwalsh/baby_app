'use client';

import { DATE_FORMATS, formatDate } from '@/components/tracking-format';
import { BOTTLE_TIMES, useBottleTime } from '@/hooks/use-bottle-time';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useDateFormat } from '@/hooks/use-date-format';
import { THEMES, useTheme } from '@/hooks/use-theme';
import { TILE_TEXT_SIZES, useTileTextSize } from '@/hooks/use-tile-text-size';
import { TRACKING_VIEWS, useTrackingView } from '@/hooks/use-tracking-view';

/**
 * The settings that are about whoever is holding the phone rather than about the baby: the theme, the clock and date formats, the tile text size, what the notepad button opens, and which time places a bottle in the log. They live in local storage and change the moment they are tapped.
 */
export function PhoneSettings() {
  const { is24Hour, setIs24Hour } = useClockFormat();
  const { dateFormat, setDateFormat } = useDateFormat();
  const { setTileTextSize, tileTextSize } = useTileTextSize();
  const { setTheme, theme } = useTheme();
  const { setTrackingView, trackingView } = useTrackingView();
  const { bottleTimeBasis, setBottleTimeBasis } = useBottleTime();

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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground/60 mb-1 text-sm">Tile text on this phone</legend>
        <div className="flex flex-wrap gap-2">
          {TILE_TEXT_SIZES.map(({ className, label, size: option }) => (
            <button
              className={`rounded-lg border px-4 py-2 ${className} ${tileTextSize === option ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'}`}
              key={option}
              onClick={() => {
                setTileTextSize(option);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

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
    </>
  );
}
