'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { getTrackingLogAction, type TrackingLog } from '@/app/actions/tracking';
import { TILE_COLORS } from '@/components/track-tiles';
import { formatClockTime, formatDayLabel, formatDuration, startOfDay, startOfNextDay } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useDateFormat } from '@/hooks/use-date-format';
import { useNow } from '@/hooks/use-now';

type ReportEvent = {
  colorClassName: string;
  details: string;
  href: string;
  key: string;
  label: string;
  note: string;
  time: number;
};

type ReportDay = {
  diaperCount: number;
  drankMilliliters: number;
  events: ReportEvent[];
  sleepMilliseconds: number;
  start: number;
};

/**
 * Each entry sits under the day it started on, but a day's sleep total counts only the part of each sleep that fell inside it, so a night that crosses midnight is split between the two days. A sleep still going on counts up to now.
 */
function buildDays(log: TrackingLog, now: number, is24Hour: boolean): ReportDay[] {
  const events: ReportEvent[] = [];

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

  const days: ReportDay[] = [];
  for (const event of events) {
    const start = startOfDay(event.time);
    let day = days.at(-1);
    if (day?.start !== start) {
      day = { diaperCount: 0, drankMilliliters: 0, events: [], sleepMilliseconds: 0, start };
      days.push(day);
    }

    day.events.push(event);
  }

  for (const day of days) {
    const end = startOfNextDay(day.start);
    for (const sleep of log.sleeps) {
      const sleepStart = new Date(sleep.startedAt).getTime();
      const sleepEnd = sleep.endedAt === null ? now : new Date(sleep.endedAt).getTime();
      day.sleepMilliseconds += Math.max(0, Math.min(sleepEnd, end) - Math.max(sleepStart, day.start));
    }

    for (const bottle of log.bottles) {
      const prepared = new Date(bottle.preparedAt).getTime();
      if (prepared >= day.start && prepared < end) {
        day.drankMilliliters += bottle.drankMilliliters ?? 0;
      }
    }

    day.diaperCount = day.events.filter((event) => event.label === 'Diaper').length;
  }

  return days;
}

export function Reports({ secretHash }: { readonly secretHash: string }) {
  const [log, setLog] = useState<null | TrackingLog>(null);
  const [error, setError] = useState<null | string>(null);
  const { is24Hour } = useClockFormat();
  const { dateFormat } = useDateFormat();
  const now = useNow();

  const load = useCallback(async () => {
    try {
      setLog(await getTrackingLogAction(secretHash));
      setError(null);
    } catch {
      setError('Could not load the tracking log.');
    }
  }, [secretHash]);

  useEffect(() => {
    load();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        load();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  const days = log === null || now === null ? [] : buildDays(log, now, is24Hour);

  return (
    <div className="flex flex-col gap-6">
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      {log !== null && days.length === 0 && <p className="text-foreground/50 text-sm">Nothing tracked yet.</p>}
      {now !== null &&
        days.map((day) => (
          <section className="flex flex-col gap-2" key={day.start}>
            <header className="border-foreground/10 flex flex-col border-b pb-1">
              <h2 className="font-semibold">{formatDayLabel(day.start, now, dateFormat)}</h2>
              <p className="text-foreground/50 text-xs">
                Slept {formatDuration(day.sleepMilliseconds)} · drank {day.drankMilliliters} ml · {day.diaperCount} {day.diaperCount === 1 ? 'diaper' : 'diapers'}
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
