'use client';

import { CalendarDaysIcon } from 'lucide-react';
import Link from 'next/link';

import { type TrackingLog } from '@/app/actions/tracking';
import { type DayTotals, getDayTotals } from '@/components/day-totals';
import { TILE_COLORS } from '@/components/track-tiles';
import { formatClockTime, formatDate, formatDayLabel, formatDuration, startOfDay } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useDateFormat } from '@/hooks/use-date-format';
import { useNow } from '@/hooks/use-now';
import { useTrackingLog } from '@/hooks/use-tracking-log';
import { DAY_CALENDAR_HREF } from '@/hooks/use-tracking-view';

type ListEvent = {
  colorClassName: string;
  details: string;
  href: string;
  key: string;
  label: string;
  note: string;
  time: number;
};

type ListDay = {
  events: ListEvent[];
  start: number;
  totals: DayTotals;
};

/**
 * Each entry sits under the day it started on; the totals are worked out as components/day-totals.ts describes.
 */
function buildDays(log: TrackingLog, now: number, is24Hour: boolean): ListDay[] {
  const events: ListEvent[] = [];

  for (const sleep of log.sleeps) {
    const start = new Date(sleep.startedAt).getTime();
    const end = sleep.endedAt === null ? null : new Date(sleep.endedAt).getTime();
    events.push({
      colorClassName: TILE_COLORS.sleep.label,
      details: end === null ? 'still sleeping' : `until ${formatClockTime(end, is24Hour)}, ${formatDuration(end - start)}`,
      href: `/track/sleep?id=${sleep.id}`,
      key: `sleep-${sleep.id}`,
      label: 'Sleep',
      note: sleep.note,
      time: start,
    });
  }

  for (const bottle of log.bottles) {
    const details = [
      bottle.drankMilliliters === null ? '' : `drank ${bottle.drankMilliliters} ml`,
      bottle.touchedLipsAt === null ? '' : `touched lips ${formatClockTime(bottle.touchedLipsAt, is24Hour)}`,
    ];
    events.push({
      colorClassName: TILE_COLORS.bottle.label,
      details: details.filter((detail) => detail !== '').join(', '),
      href: `/track/bottle?id=${bottle.id}`,
      key: `bottle-${bottle.id}`,
      label: 'Bottle',
      note: bottle.note,
      time: new Date(bottle.preparedAt).getTime(),
    });
  }

  for (const diaper of log.diapers) {
    events.push({
      colorClassName: TILE_COLORS.diaper.label,
      details: '',
      href: `/track/diaper?id=${diaper.id}`,
      key: `diaper-${diaper.id}`,
      label: 'Diaper',
      note: diaper.note,
      time: new Date(diaper.changedAt).getTime(),
    });
  }

  events.sort((first, second) => second.time - first.time);

  const days: ListDay[] = [];
  for (const event of events) {
    const start = startOfDay(event.time);
    let day = days.at(-1);
    if (day?.start !== start) {
      day = { events: [], start, totals: getDayTotals(log, start, now) };
      days.push(day);
    }

    day.events.push(event);
  }

  return days;
}

export function TrackingList({ secretHash }: { readonly secretHash: string }) {
  const { error, log } = useTrackingLog(secretHash);
  const { is24Hour } = useClockFormat();
  const { dateFormat } = useDateFormat();
  const now = useNow();

  const days = log === null || now === null ? [] : buildDays(log, now, is24Hour);

  return (
    <div className="flex flex-col gap-6">
      <Link aria-label="Day calendar" className="text-foreground/40 self-end p-1" href={DAY_CALENDAR_HREF}>
        <CalendarDaysIcon className="size-5" />
      </Link>
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      {log !== null && days.length === 0 && <p className="text-foreground/50 text-sm">Nothing tracked yet.</p>}
      {now !== null &&
        days.map((day) => (
          <section className="flex flex-col gap-2" key={day.start}>
            <header className="border-foreground/10 flex flex-col border-b pb-1">
              <h2 className="font-semibold">
                <Link href={`${DAY_CALENDAR_HREF}?date=${formatDate(day.start, 'iso')}`}>{formatDayLabel(day.start, now, dateFormat)}</Link>
              </h2>
              <p className="text-foreground/50 text-xs">
                Slept {formatDuration(day.totals.sleepMilliseconds)} · drank {day.totals.drankMilliliters} ml · {day.totals.diaperCount}{' '}
                {day.totals.diaperCount === 1 ? 'diaper' : 'diapers'}
              </p>
            </header>
            <ul className="flex flex-col">
              {day.events.map((event) => (
                <li key={event.key}>
                  <Link className="flex gap-3 py-2" href={event.href}>
                    <span className="text-foreground/60 w-16 shrink-0 text-sm tabular-nums">{formatClockTime(event.time, is24Hour)}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm">
                        <span className={`font-semibold ${event.colorClassName}`}>{event.label}</span>
                        {event.details !== '' && <span className="text-foreground/70"> {event.details}</span>}
                      </span>
                      {event.note !== '' && <span className="text-foreground/50 truncate text-sm italic">{event.note}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
