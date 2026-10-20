'use client';

import { ListIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { type TrackingLog } from '@/app/actions/tracking';
import { DateStrip } from '@/components/date-strip';
import { DayTimeline } from '@/components/day-timeline';
import { getDayTotals } from '@/components/day-totals';
import { LoginGuard } from '@/components/login-guard';
import { TILE_COLORS } from '@/components/track-tiles';
import { formatDate, formatDayLabel, formatDuration, startOfDay, startOfNextDay } from '@/components/tracking-format';
import { useBottleTime } from '@/hooks/use-bottle-time';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useDateFormat } from '@/hooks/use-date-format';
import { useNow } from '@/hooks/use-now';
import { useTrackingLog } from '@/hooks/use-tracking-log';
import { DAY_CALENDAR_HREF, TRACKING_LIST_HREF } from '@/hooks/use-tracking-view';

const DATE_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

/**
 * `YYYY-MM-DD` as the local midnight it names, or null for anything else.
 */
function parseDate(value: string | undefined): null | number {
  const groups = value === undefined ? undefined : DATE_PATTERN.exec(value)?.groups;

  return groups === undefined ? null : new Date(Number(groups.year), Number(groups.month) - 1, Number(groups.day)).getTime();
}

/**
 * The local midnight of the earliest thing ever logged, or null when nothing has been.
 */
function getFirstDayStart(log: TrackingLog): null | number {
  const times = [...log.sleeps.map((sleep) => sleep.startedAt), ...log.bottles.map((bottle) => bottle.preparedAt), ...log.diapers.map((diaper) => diaper.changedAt)].map((time) =>
    new Date(time).getTime(),
  );

  return times.length === 0 ? null : startOfDay(Math.min(...times));
}

/**
 * Every day from the first to the last, oldest first, so the last is the rightmost.
 */
function listDayStarts(first: number, last: number): number[] {
  const dayStarts: number[] = [];
  for (let dayStart = first; dayStart <= last; dayStart = startOfNextDay(dayStart)) {
    dayStarts.push(dayStart);
  }

  return dayStarts;
}

function DayCalendar({ date, secretHash }: { readonly date: string | undefined; readonly secretHash: string }) {
  const { error, log } = useTrackingLog(secretHash);
  const { is24Hour } = useClockFormat();
  const { bottleTimeBasis } = useBottleTime();
  const { dateFormat } = useDateFormat();
  const now = useNow();
  const [chosenDayStart, setChosenDayStart] = useState(() => parseDate(date));

  if (now === null || log === null) {
    return error === null ? <p className="text-sm opacity-60">Loading…</p> : <p className="text-sm text-amber-500">{error}</p>;
  }

  const today = startOfDay(now);
  const selectedDayStart = Math.min(chosenDayStart ?? today, today);
  const firstDayStart = Math.min(getFirstDayStart(log) ?? today, selectedDayStart);
  const dayStarts = listDayStarts(firstDayStart, today);
  const totals = getDayTotals(log, selectedDayStart, now, bottleTimeBasis);

  return (
    <div className="flex flex-col gap-5">
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      <DateStrip
        dayStarts={dayStarts}
        onSelect={(dayStart) => {
          setChosenDayStart(dayStart);
          /**
           * Kept in the address so a reload, or coming back from editing an entry, lands on the same day. Replaced rather than pushed, so the back button leaves the calendar instead of stepping through days.
           */
          window.history.replaceState(null, '', `${DAY_CALENDAR_HREF}?date=${formatDate(dayStart, 'iso')}`);
        }}
        selectedDayStart={selectedDayStart}
      />

      <header className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{formatDayLabel(selectedDayStart, now, dateFormat)}</h2>
        <Link aria-label="Tracking list" className="text-foreground/40 p-1" href={TRACKING_LIST_HREF}>
          <ListIcon className="size-5" />
        </Link>
      </header>

      <dl className="grid grid-cols-3 gap-2">
        <div className={`flex flex-col rounded-xl border px-3 py-2 ${TILE_COLORS.sleep.border}`}>
          <dt className={`text-xs ${TILE_COLORS.sleep.label}`}>Slept</dt>
          <dd className="tabular-nums">{formatDuration(totals.sleepMilliseconds)}</dd>
        </div>
        <div className={`flex flex-col rounded-xl border px-3 py-2 ${TILE_COLORS.bottle.border}`}>
          <dt className={`text-xs ${TILE_COLORS.bottle.label}`}>Drank</dt>
          <dd className="tabular-nums">{totals.drankMilliliters} ml</dd>
        </div>
        <div className={`flex flex-col rounded-xl border px-3 py-2 ${TILE_COLORS.diaper.border}`}>
          <dt className={`text-xs ${TILE_COLORS.diaper.label}`}>Diapers</dt>
          <dd className="tabular-nums">{totals.diaperCount}</dd>
        </div>
      </dl>

      <DayTimeline bottleTimeBasis={bottleTimeBasis} dayStart={selectedDayStart} is24Hour={is24Hour} log={log} now={now} />
    </div>
  );
}

export function DayCalendarPage({ date }: { readonly date: string | undefined }) {
  return (
    <div className="flex flex-col gap-8 px-6 py-6">
      <LoginGuard>{(secretHash) => <DayCalendar date={date} secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
