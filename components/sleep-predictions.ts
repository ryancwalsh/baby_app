import { startOfDay, startOfNextDay } from '@/components/tracking-format';
import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE, MINUTES_PER_HOUR } from '@/constants/time';
import { type Sleep, type TrackingSettings } from '@/storage/tracking-types';

/**
 * Next sleep = when he last woke + the wake window for the sleep that comes next. A day has one wake window per nap and one more before bed, so which window applies depends on how many naps he has had today.
 *
 * Telling a nap from night sleep matters, because night sleep is broken up by feeds and each piece is logged as its own sleep. A nap is a sleep that starts in the daytime, as the day versus night times in settings define it, and is shorter than a night's stretch; everything else is night.
 */

const NAP_MAXIMUM_MILLISECONDS = 4 * MILLISECONDS_PER_HOUR;
const LEARNING_DAYS = 14;
/**
 * A bedtime that slips past midnight still belongs to the day before.
 */
const LATEST_BEDTIME_AFTER_MIDNIGHT_MILLISECONDS = 3 * MILLISECONDS_PER_HOUR;
const MONTHS_PER_YEAR = 12;

/**
 * Rough typical wake windows by age, in minutes, starting from the month given. A starting point rather than advice: the fixed method is there for whatever actually suits him.
 */
const WAKE_WINDOWS_BY_AGE: Array<{ fromMonth: number; threeNap: number[]; twoNap: number[] }> = [
  { fromMonth: 0, threeNap: [60, 75, 75, 90], twoNap: [75, 90, 105] },
  { fromMonth: 4, threeNap: [105, 120, 120, 135], twoNap: [120, 135, 150] },
  { fromMonth: 6, threeNap: [120, 135, 150, 150], twoNap: [135, 150, 165] },
  { fromMonth: 8, threeNap: [135, 150, 165, 180], twoNap: [150, 180, 195] },
  { fromMonth: 11, threeNap: [150, 165, 180, 180], twoNap: [180, 195, 225] },
  { fromMonth: 15, threeNap: [150, 165, 180, 180], twoNap: [180, 210, 240] },
];

export type NapCount = 2 | 3;

export type SleepPrediction = {
  /**
   * Which sleep it is: a nap, numbered from 1, or bedtime.
   */
  label: string;
  napCount: NapCount;
  time: number;
};

type CompletedSleep = { end: number; start: number };

function toCompleted(sleeps: Sleep[]): CompletedSleep[] {
  const completed: CompletedSleep[] = [];
  for (const sleep of sleeps) {
    if (sleep.endedAt !== null) {
      completed.push({ end: new Date(sleep.endedAt).getTime(), start: new Date(sleep.startedAt).getTime() });
    }
  }

  return completed.sort((first, second) => first.start - second.start);
}

/**
 * `HH:MM` as minutes after midnight.
 */
function toMinutesOfDay(timeOfDay: string): number {
  const [hours = 0, minutes = 0] = timeOfDay.split(':').map(Number);

  return hours * MINUTES_PER_HOUR + minutes;
}

export function isNap(start: number, end: number, settings: TrackingSettings): boolean {
  const startDate = new Date(start);
  const startMinutes = startDate.getHours() * MINUTES_PER_HOUR + startDate.getMinutes();

  return startMinutes >= toMinutesOfDay(settings.dayStartsAt) && startMinutes < toMinutesOfDay(settings.dayEndsAt) && end - start < NAP_MAXIMUM_MILLISECONDS;
}

function getAgeInMonths(birthDate: string, now: number): number {
  const birth = new Date(`${birthDate}T00:00`);
  const today = new Date(now);
  let months = (today.getFullYear() - birth.getFullYear()) * MONTHS_PER_YEAR + today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) {
    months -= 1;
  }

  return months;
}

function getAgeWindows(birthDate: null | string, napCount: NapCount, now: number): null | number[] {
  let windows: null | number[] = null;
  if (birthDate !== null) {
    const months = getAgeInMonths(birthDate, now);
    for (const row of WAKE_WINDOWS_BY_AGE) {
      if (months >= row.fromMonth) {
        windows = napCount === 2 ? row.twoNap : row.threeNap;
      }
    }
  }

  return windows;
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  const upper = sorted[middle] ?? 0;

  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? upper) + upper) / 2 : upper;
}

/**
 * The median of each wake window over the past two weeks, from the days that had exactly this many naps. A window never seen falls back to the fixed one.
 */
function getLearnedWindows(sleeps: CompletedSleep[], napCount: NapCount, fallback: number[], now: number, settings: TrackingSettings): number[] {
  const isNapSleep = (sleep: CompletedSleep) => isNap(sleep.start, sleep.end, settings);
  const samples: number[][] = fallback.map(() => []);
  const today = startOfDay(now);

  for (let daysAgo = 1; daysAgo <= LEARNING_DAYS; daysAgo += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const dayStart = date.getTime();
    const dayEnd = startOfNextDay(dayStart);
    const naps = sleeps.filter((sleep) => isNapSleep(sleep) && sleep.start >= dayStart && sleep.start < dayEnd);

    const firstNap = naps[0];
    const lastNap = naps.at(-1);

    if (naps.length === napCount && firstNap !== undefined && lastNap !== undefined) {
      const morning = sleeps.findLast((sleep) => !isNapSleep(sleep) && sleep.end >= dayStart && sleep.end <= firstNap.start);
      const bedtime = sleeps.find((sleep) => !isNapSleep(sleep) && sleep.start >= lastNap.end && sleep.start < dayEnd + LATEST_BEDTIME_AFTER_MIDNIGHT_MILLISECONDS);
      /**
       * Each wake window is the gap between one sleep ending and the next starting, so a morning or a bedtime that was not logged only loses the window beside it.
       */
      const boundaries = [morning, ...naps, bedtime];

      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const before = boundaries[index];
        const after = boundaries[index + 1];
        if (before !== undefined && after !== undefined) {
          samples[index]?.push((after.start - before.end) / MILLISECONDS_PER_MINUTE);
        }
      }
    }
  }

  return fallback.map((minutes, index) => {
    const seen = samples[index] ?? [];

    return seen.length > 0 ? median(seen) : minutes;
  });
}

function getWindows(settings: TrackingSettings, sleeps: CompletedSleep[], napCount: NapCount, now: number): number[] {
  const fixed = napCount === 2 ? settings.twoNapWakeWindowMinutes : settings.threeNapWakeWindowMinutes;
  let windows = fixed;
  if (settings.predictionMethod === 'learned') {
    windows = getLearnedWindows(sleeps, napCount, fixed, now, settings);
  } else if (settings.predictionMethod === 'age') {
    windows = getAgeWindows(settings.birthDate, napCount, now) ?? fixed;
  }

  return windows;
}

/**
 * One prediction for a 2-nap day and one for a 3-nap day, or none while he is asleep or before any sleep has been logged.
 */
export function predictNextSleeps(sleeps: Sleep[], settings: TrackingSettings, now: number): SleepPrediction[] {
  const predictions: SleepPrediction[] = [];
  const isSleeping = sleeps.some((sleep) => sleep.endedAt === null);
  const completed = toCompleted(sleeps);
  const lastSleep = completed.at(-1);

  if (!isSleeping && lastSleep !== undefined) {
    const today = startOfDay(now);
    /**
     * Woken from the night, this is the first window of the day; woken from a nap, it is the window after however many naps there have been today.
     */
    const isNapSleep = (sleep: CompletedSleep) => isNap(sleep.start, sleep.end, settings);
    const napsSoFar = isNapSleep(lastSleep) ? completed.filter((sleep) => isNapSleep(sleep) && sleep.start >= today && sleep.end <= lastSleep.end).length : 0;
    const napCounts: NapCount[] = [2, 3];

    for (const napCount of napCounts) {
      const windows = getWindows(settings, completed, napCount, now);
      const index = Math.min(napsSoFar, windows.length - 1);
      const minutes = windows[index];
      if (minutes !== undefined) {
        predictions.push({
          label: index === napCount ? 'bedtime' : `nap ${index + 1}`,
          napCount,
          time: lastSleep.end + minutes * MILLISECONDS_PER_MINUTE,
        });
      }
    }
  }

  return predictions;
}
