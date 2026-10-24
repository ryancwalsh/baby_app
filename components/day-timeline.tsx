'use client';

import Link from 'next/link';

import { type TrackingLog } from '@/app/actions/tracking';
import { TILE_COLORS } from '@/components/tile-styles';
import { formatClockTime, formatDate, formatDuration, startOfNextDay } from '@/components/tracking-format';
import { HOURS_PER_DAY } from '@/constants/time';
import { type BottleTimeBasis, getBottleTime } from '@/hooks/use-bottle-time';

const HOUR_HEIGHT_PIXELS = 64;
const TIMELINE_HEIGHT_PIXELS = HOUR_HEIGHT_PIXELS * HOURS_PER_DAY;

/**
 * Tall enough to tap in the dark. A bottle, a diaper, or a medicine is a moment rather than a length of time, so its mark is always this tall.
 */
const MARK_HEIGHT_PIXELS = 28;
const SLEEP_MINIMUM_HEIGHT_PIXELS = 16;

/**
 * A sleep block shorter than this has no room for its times.
 */
const SLEEP_TEXT_MINIMUM_HEIGHT_PIXELS = 48;

type TimelineMark = {
  height: number;
  href: string;
  key: string;
  label: string;
  text: string;
  top: number;
};

type Timeline = {
  bottles: TimelineMark[];
  diapers: TimelineMark[];
  medicines: TimelineMark[];
  sleeps: TimelineMark[];
};

function formatHour(time: number, is24Hour: boolean): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', hourCycle: is24Hour ? 'h23' : 'h12' }).format(time);
}

/**
 * Positions are a share of the day's real length rather than of 24 hours, so the two days a year the clocks change still end at the bottom. A sleep that crosses midnight is cut off at the edge of each day it touches, and one still going on runs up to now. A bottle or a diaper is centred on its moment, without spilling past either end of the day.
 */
function buildTimeline(log: TrackingLog, dayStart: number, now: number, is24Hour: boolean, bottleTimeBasis: BottleTimeBasis): Timeline {
  const dayEnd = startOfNextDay(dayStart);
  const date = formatDate(dayStart, 'iso');

  function toPixels(time: number) {
    return ((time - dayStart) / (dayEnd - dayStart)) * TIMELINE_HEIGHT_PIXELS;
  }

  function toMarkTop(time: number) {
    return Math.min(Math.max(toPixels(time) - MARK_HEIGHT_PIXELS / 2, 0), TIMELINE_HEIGHT_PIXELS - MARK_HEIGHT_PIXELS);
  }

  function getHref(kind: string, id: number) {
    return `/track/${kind}?id=${id}&from=day&date=${date}`;
  }

  const timeline: Timeline = { bottles: [], diapers: [], medicines: [], sleeps: [] };

  for (const sleep of log.sleeps) {
    const start = new Date(sleep.startedAt).getTime();
    const end = sleep.endedAt === null ? now : new Date(sleep.endedAt).getTime();
    if (start < dayEnd && end > dayStart) {
      const top = toPixels(Math.max(start, dayStart));
      const height = Math.max(toPixels(Math.min(end, dayEnd)) - top, SLEEP_MINIMUM_HEIGHT_PIXELS);
      const text = `${formatClockTime(start, is24Hour)}–${sleep.endedAt === null ? 'now' : formatClockTime(end, is24Hour)} · ${formatDuration(end - start)}`;
      timeline.sleeps.push({
        height,
        href: getHref('sleep', sleep.id),
        key: `sleep-${sleep.id}`,
        label: `Sleep ${text}`,
        text: height >= SLEEP_TEXT_MINIMUM_HEIGHT_PIXELS ? text : '',
        top,
      });
    }
  }

  for (const bottle of log.bottles) {
    const time = getBottleTime(bottle, bottleTimeBasis);
    if (time >= dayStart && time < dayEnd) {
      const text = bottle.drankMilliliters === null ? '' : `${bottle.drankMilliliters} ml`;
      timeline.bottles.push({
        height: MARK_HEIGHT_PIXELS,
        href: getHref('bottle', bottle.id),
        key: `bottle-${bottle.id}`,
        label: `Bottle at ${formatClockTime(time, is24Hour)}${text === '' ? '' : `, ${text}`}`,
        text,
        top: toMarkTop(time),
      });
    }
  }

  for (const diaper of log.diapers) {
    const time = new Date(diaper.changedAt).getTime();
    if (time >= dayStart && time < dayEnd) {
      timeline.diapers.push({
        height: MARK_HEIGHT_PIXELS,
        href: getHref('diaper', diaper.id),
        key: `diaper-${diaper.id}`,
        label: `Diaper at ${formatClockTime(time, is24Hour)}`,
        text: '',
        top: toMarkTop(time),
      });
    }
  }

  for (const medicine of log.medicines) {
    const time = new Date(medicine.givenAt).getTime();
    if (time >= dayStart && time < dayEnd) {
      timeline.medicines.push({
        height: MARK_HEIGHT_PIXELS,
        href: getHref('medicine', medicine.id),
        key: `medicine-${medicine.id}`,
        label: `${medicine.name} ${medicine.amountMilliliters} ml at ${formatClockTime(time, is24Hour)}`,
        text: '',
        top: toMarkTop(time),
      });
    }
  }

  return timeline;
}

function Lane({ className, linkClassName, marks }: { readonly className: string; readonly linkClassName: string; readonly marks: TimelineMark[] }) {
  return (
    <div className={`relative ${className}`}>
      {marks.map((mark) => (
        <Link
          aria-label={mark.label}
          className={`absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 text-sm leading-7 ${linkClassName}`}
          href={mark.href}
          key={mark.key}
          style={{ height: mark.height, top: mark.top }}
        >
          {mark.text}
        </Link>
      ))}
    </div>
  );
}

/**
 * The day from midnight at the top to midnight at the bottom. Every block and mark opens that entry's form, which comes back to this day when it is done.
 */
export function DayTimeline({
  bottleTimeBasis,
  dayStart,
  is24Hour,
  log,
  now,
}: {
  readonly bottleTimeBasis: BottleTimeBasis;
  readonly dayStart: number;
  readonly is24Hour: boolean;
  readonly log: TrackingLog;
  readonly now: number;
}) {
  const dayEnd = startOfNextDay(dayStart);
  const timeline = buildTimeline(log, dayStart, now, is24Hour, bottleTimeBasis);
  const hours = Array.from({ length: HOURS_PER_DAY }, (_, hour) => {
    const time = new Date(dayStart);
    time.setHours(hour);

    return time.getTime();
  });

  return (
    <div className="relative flex" style={{ height: TIMELINE_HEIGHT_PIXELS }}>
      {hours.map((time) => (
        <div
          aria-hidden
          className="border-foreground/5 pointer-events-none absolute inset-x-0 border-t"
          key={time}
          style={{ top: ((time - dayStart) / (dayEnd - dayStart)) * TIMELINE_HEIGHT_PIXELS }}
        >
          <span className="text-foreground/50 absolute -top-2.5 left-0 w-14 text-sm tabular-nums">{formatHour(time, is24Hour)}</span>
        </div>
      ))}
      {/* Each kind has its own lane, so a bottle given during a sleep, or a diaper changed at the same time as a bottle, never covers the other. */}
      <div className="w-15 shrink-0" />
      <Lane className="flex-1" linkClassName={`border ${TILE_COLORS.sleep.border} ${TILE_COLORS.sleep.surface} ${TILE_COLORS.sleep.label}`} marks={timeline.sleeps} />
      <Lane className="w-20 shrink-0" linkClassName="bg-orange-500/60 text-background font-semibold" marks={timeline.bottles} />
      <Lane className="w-6 shrink-0" linkClassName="bg-yellow-500/60" marks={timeline.diapers} />
      <Lane className="w-6 shrink-0" linkClassName="bg-rose-500/60" marks={timeline.medicines} />
    </div>
  );
}
