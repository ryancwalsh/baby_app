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
 * How long ago, or how long until: seconds while it is under an hour, so a counter that ticks visibly is plainly alive.
 */
export function formatElapsed(milliseconds: number): string {
  const absolute = Math.abs(milliseconds);
  const days = Math.floor(absolute / MILLISECONDS_PER_DAY);
  const hours = Math.floor(absolute / MILLISECONDS_PER_HOUR) % HOURS_PER_DAY;
  const minutes = Math.floor(absolute / MILLISECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const seconds = Math.floor(absolute / MILLISECONDS_PER_SECOND) % SECONDS_PER_MINUTE;

  let formatted = `${minutes}m ${pad(seconds)}s`;
  if (days > 0) {
    formatted = `${days}d ${hours}h`;
  } else if (hours > 0) {
    formatted = `${hours}h ${pad(minutes)}m`;
  }

  return formatted;
}

export function formatAgo(milliseconds: number): string {
  return milliseconds < 0 ? `in ${formatElapsed(milliseconds)}` : `${formatElapsed(milliseconds)} ago`;
}

/**
 * A length of time without seconds, for durations and totals.
 */
export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.round(Math.max(milliseconds, 0) / MILLISECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  return hours > 0 ? `${hours}h ${pad(minutes)}m` : `${minutes}m`;
}

export function formatStopwatch(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(milliseconds, 0) / MILLISECONDS_PER_SECOND);
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatClockTime(time: Date | number | string, is24Hour: boolean): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', hourCycle: is24Hour ? 'h23' : 'h12', minute: '2-digit' }).format(new Date(time));
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

export function formatDayLabel(dayStart: number, now: number): string {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let label = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', weekday: 'short' }).format(dayStart);
  if (dayStart === today) {
    label = 'Today';
  } else if (dayStart === yesterday.getTime()) {
    label = 'Yesterday';
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
