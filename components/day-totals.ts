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
 * A day's sleep total counts only the part of each sleep that fell inside it, so a night that crosses midnight is split between the two days. A sleep still going on counts up to now, and is sorted into naps or night as though it ended now. Bottles and diapers count on the day they happened, a bottle by whichever of its times this phone places it at.
 */
export function getDayTotals(log: TrackingLog, dayStart: number, now: number, bottleTimeBasis: BottleTimeBasis): DayTotals {
  const dayEnd = startOfNextDay(dayStart);
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
