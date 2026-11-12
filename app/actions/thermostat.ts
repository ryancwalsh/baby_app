'use server';

import { requireLogin } from '@/auth/login';
import { type CribRange } from '@/services/ecobee/decide';
import {
  getCribRange,
  getLatestThermostatDecision,
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
