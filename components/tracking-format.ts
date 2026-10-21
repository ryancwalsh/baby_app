import {
  HOURS_PER_DAY,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
} from '@/constants/time';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * How long ago, or how long until, to the minute: the tiles are glanced at, and a figure that changes every second is only noise.
 */
export function formatElapsed(milliseconds: number): string {
  const absolute = Math.abs(milliseconds);
  const days = Math.floor(absolute / MILLISECONDS_PER_DAY);
  const hours = Math.floor(absolute / MILLISECONDS_PER_HOUR) % HOURS_PER_DAY;
  const minutes = Math.floor(absolute / MILLISECONDS_PER_MINUTE) % MINUTES_PER_HOUR;

  let formatted = `${minutes}m`;
  if (days > 0) {
    formatted = `${days}d ${hours}h`;
  } else if (hours > 0) {
    formatted = `${hours}h ${minutes}m`;
  }

  return formatted;
}

export function formatAgo(milliseconds: number): string {
  let formatted = `${formatElapsed(milliseconds)} ago`;
  if (Math.abs(milliseconds) < MILLISECONDS_PER_MINUTE) {
    formatted = milliseconds < 0 ? 'now' : 'just now';
  } else if (milliseconds < 0) {
    formatted = `in ${formatElapsed(milliseconds)}`;
  }

  return formatted;
}

/**
 * A length of time without seconds, for durations and totals.
 */
export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.round(Math.max(milliseconds, 0) / MILLISECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * The one counter that does tick each second, for a sleep still going on: `1h 26m 3s`, `26m 3s`, or `3s`.
 */
export function formatRunningDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(milliseconds, 0) / MILLISECONDS_PER_SECOND);
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  let formatted = `${seconds}s`;
  if (hours > 0) {
    formatted = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    formatted = `${minutes}m ${seconds}s`;
  }

  return formatted;
}

export function formatClockTime(time: Date | number | string, is24Hour: boolean): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', hourCycle: is24Hour ? 'h23' : 'h12', minute: '2-digit' }).format(new Date(time));
}

/**
 * A clock time as short as it can be, for tight spaces: `3:15p` on a 12-hour clock, or `15:15` on a 24-hour one.
 */
export function formatShortClockTime(time: number, is24Hour: boolean): string {
  const date = new Date(time);
  const hours = date.getHours();
  const hoursPerHalfDay = HOURS_PER_DAY / 2;

  return is24Hour ? `${pad(hours)}:${pad(date.getMinutes())}` : `${hours % hoursPerHalfDay || hoursPerHalfDay}:${pad(date.getMinutes())}${hours < hoursPerHalfDay ? 'a' : 'p'}`;
}

/**
 * The start of the local day the time falls on.
 */
export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);

  return date.getTime();
}

/**
 * The next local midnight, found through the calendar rather than by adding 24 hours, which is wrong on the two days a year the clocks change.
 */
export function startOfNextDay(time: number): number {
  const date = new Date(startOfDay(time));
  date.setDate(date.getDate() + 1);

  return date.getTime();
}

export const DATE_FORMATS = ['iso-weekday', 'iso', 'weekday-month-day', 'month-day-year', 'day-month-year'] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const WEEKDAY_MONTH_DAY_FORMAT = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', weekday: 'short' });

export function formatDate(time: number, format: DateFormat): string {
  const date = new Date(time);
  const year = String(date.getFullYear());
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const formats: Record<DateFormat, () => string> = {
    'day-month-year': () => `${day}/${month}/${year}`,
    iso: () => `${year}-${month}-${day}`,
    'iso-weekday': () => `${year}-${month}-${day} ${WEEKDAY_FORMAT.format(date)}`,
    'month-day-year': () => `${month}/${day}/${year}`,
    'weekday-month-day': () => WEEKDAY_MONTH_DAY_FORMAT.format(date),
  };

  return formats[format]();
}

/**
 * Today and yesterday are named as well as dated, since those are the two days looked at most.
 */
export function formatDayLabel(dayStart: number, now: number, format: DateFormat): string {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const date = formatDate(dayStart, format);
  let label = date;
  if (dayStart === today) {
    label = `Today · ${date}`;
  } else if (dayStart === yesterday.getTime()) {
    label = `Yesterday · ${date}`;
  }

  return label;
}

/**
 * `<input type="datetime-local">` speaks local time without an offset, `YYYY-MM-DDTHH:mm`.
 */
export function toDateTimeInputValue(time: Date | number | string): string {
  const date = new Date(time);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A value without an offset is read as local time, which is what the input meant. Empty stays empty.
 */
export function fromDateTimeInputValue(value: string): null | string {
  return value === '' ? null : new Date(value).toISOString();
}
