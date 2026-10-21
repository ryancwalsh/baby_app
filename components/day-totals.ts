import { type TrackingLog } from '@/app/actions/tracking';
import { isNap } from '@/components/sleep-predictions';
import { startOfNextDay } from '@/components/tracking-format';
import { type BottleTimeBasis, getBottleTime } from '@/hooks/use-bottle-time';

export type DayTotals = {
  diaperCount: number;
  drankMilliliters: number;
  napMilliseconds: number;
  nightMilliseconds: number;
  sleepMilliseconds: number;
};

/**
 * The time of day `HH:MM` on the local day that starts at `midnight`.
 */
function atTimeOfDay(midnight: number, timeOfDay: string): number {
  const [hours = 0, minutes = 0] = timeOfDay.split(':').map(Number);
  const date = new Date(midnight);
  date.setHours(hours, minutes, 0, 0);

  return date.getTime();
}

/**
 * A day runs from midnight to midnight, or from the day start time to the next day's, as settings choose. A day's sleep total counts only the part of each sleep that fell inside it, so a sleep that crosses the start of a day is split between the two days. A sleep still going on counts up to now, and is sorted into naps or night as though it ended now. Bottles and diapers count on the day they happened, a bottle by whichever of its times this phone places it at.
 */
export function getDayTotals(log: TrackingLog, midnight: number, now: number, bottleTimeBasis: BottleTimeBasis): DayTotals {
  const nextMidnight = startOfNextDay(midnight);
  const isFromDayStart = log.settings.dayTotalsFrom === 'day-start';
  const dayStart = isFromDayStart ? atTimeOfDay(midnight, log.settings.dayStartsAt) : midnight;
  const dayEnd = isFromDayStart ? atTimeOfDay(nextMidnight, log.settings.dayStartsAt) : nextMidnight;
  const totals: DayTotals = { diaperCount: 0, drankMilliliters: 0, napMilliseconds: 0, nightMilliseconds: 0, sleepMilliseconds: 0 };

  for (const sleep of log.sleeps) {
    const sleepStart = new Date(sleep.startedAt).getTime();
    const sleepEnd = sleep.endedAt === null ? now : new Date(sleep.endedAt).getTime();
    const slept = Math.max(0, Math.min(sleepEnd, dayEnd) - Math.max(sleepStart, dayStart));
    totals.sleepMilliseconds += slept;
    if (isNap(sleepStart, sleepEnd, log.settings)) {
      totals.napMilliseconds += slept;
    } else {
      totals.nightMilliseconds += slept;
    }
  }

  for (const bottle of log.bottles) {
    const time = getBottleTime(bottle, bottleTimeBasis);
    if (time >= dayStart && time < dayEnd) {
      totals.drankMilliliters += bottle.drankMilliliters ?? 0;
    }
  }

  for (const diaper of log.diapers) {
    const changed = new Date(diaper.changedAt).getTime();
    if (changed >= dayStart && changed < dayEnd) {
      totals.diaperCount += 1;
    }
  }

  return totals;
}
