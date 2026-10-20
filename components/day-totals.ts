import { type TrackingLog } from '@/app/actions/tracking';
import { startOfNextDay } from '@/components/tracking-format';

export type DayTotals = {
  diaperCount: number;
  drankMilliliters: number;
  sleepMilliseconds: number;
};

/**
 * A day's sleep total counts only the part of each sleep that fell inside it, so a night that crosses midnight is split between the two days. A sleep still going on counts up to now. Bottles and diapers count on the day they happened.
 */
export function getDayTotals(log: TrackingLog, dayStart: number, now: number): DayTotals {
  const dayEnd = startOfNextDay(dayStart);
  const totals: DayTotals = { diaperCount: 0, drankMilliliters: 0, sleepMilliseconds: 0 };

  for (const sleep of log.sleeps) {
    const sleepStart = new Date(sleep.startedAt).getTime();
    const sleepEnd = sleep.endedAt === null ? now : new Date(sleep.endedAt).getTime();
    totals.sleepMilliseconds += Math.max(0, Math.min(sleepEnd, dayEnd) - Math.max(sleepStart, dayStart));
  }

  for (const bottle of log.bottles) {
    const prepared = new Date(bottle.preparedAt).getTime();
    if (prepared >= dayStart && prepared < dayEnd) {
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
