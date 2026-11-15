'use server';

import { requireLogin } from '@/auth/login';
import { MILLISECONDS_PER_DAY } from '@/constants/time';
import { type CribRange } from '@/services/ecobee/decide';
import {
  getCribRange,
  getLatestThermostatDecision,
  getThermostatDecisions,
  getThermostatSchedule,
  saveCribRange,
  saveThermostatSchedule,
  type ThermostatDecisionRecord,
  type ThermostatSchedule,
} from '@/storage/thermostat';

export type ThermostatSettings = {
  cribRange: CribRange | null;
  latestDecision: null | ThermostatDecisionRecord;
};

/**
 * The crib range and the worker's latest decision, both from Turso, so they show even while the laptop cannot be reached.
 */
export async function getThermostatSettingsAction(secretHash: string): Promise<ThermostatSettings> {
  await requireLogin(secretHash);

  const [cribRange, latestDecision] = await Promise.all([getCribRange(), getLatestThermostatDecision()]);

  return { cribRange, latestDecision };
}

/**
 * The worker's decisions over the last so many days, or all of them when `days` is null, for the log page.
 */
export async function getThermostatDecisionsAction(secretHash: string, days: null | number): Promise<ThermostatDecisionRecord[]> {
  await requireLogin(secretHash);

  return getThermostatDecisions(days === null ? null : new Date(Date.now() - days * MILLISECONDS_PER_DAY).toISOString());
}

export async function saveCribRangeAction(secretHash: string, range: CribRange): Promise<{ error: null | string }> {
  await requireLogin(secretHash);

  try {
    await saveCribRange(range);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save the crib range.' };
  }
}

export async function getThermostatScheduleAction(secretHash: string): Promise<ThermostatSchedule> {
  await requireLogin(secretHash);

  return getThermostatSchedule();
}

export async function saveThermostatScheduleAction(secretHash: string, schedule: ThermostatSchedule): Promise<{ error: null | string }> {
  await requireLogin(secretHash);

  try {
    await saveThermostatSchedule(schedule);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save the active hours.' };
  }
}
