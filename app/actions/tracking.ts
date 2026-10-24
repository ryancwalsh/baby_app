'use server';

import { requireLogin } from '@/auth/login';
import { MILLISECONDS_PER_DAY } from '@/constants/time';
import { deleteMedicine, getLatestMedicine, getMedicine, listMedicineNames, listMedicines, saveMedicine } from '@/storage/medicines';
import {
  deleteBottle,
  deleteDiaper,
  deleteSleep,
  endSleepNow,
  getBottle,
  getDiaper,
  getLatestBottle,
  getLatestDiaper,
  getSleep,
  listBottles,
  listDiapers,
  listSleeps,
  saveBottle,
  saveDiaper,
  saveSleep,
  startSleepNow,
} from '@/storage/tracking';
import { getSettings, saveSettings } from '@/storage/tracking-settings';
import {
  type Bottle,
  type BottleInput,
  DEFAULT_MEDICINE_NAMES,
  type Diaper,
  type DiaperInput,
  type Medicine,
  type MedicineInput,
  type Sleep,
  type SleepInput,
  type TrackingSettings,
} from '@/storage/tracking-types';

/**
 * Enough sleep history for the learned predictions, which look back two weeks, with a couple of days to spare for a night that crossed the boundary.
 */
const RECENT_SLEEP_DAYS = 16;

export type TrackingSummary = {
  latestBottle: Bottle | null;
  latestDiaper: Diaper | null;
  latestMedicine: Medicine | null;
  recentSleeps: Sleep[];
  settings: TrackingSettings;
};

export type TrackingLog = {
  bottles: Bottle[];
  diapers: Diaper[];
  medicines: Medicine[];
  /**
   * For telling naps from night sleep in the day totals.
   */
  settings: TrackingSettings;
  sleeps: Sleep[];
};

export type ActionResult = { error: null | string };

/**
 * A refused save is answered rather than thrown, because a production build hides a thrown message from the page and the person saving needs to see why.
 */
async function attempt(secretHash: string, work: () => Promise<void>, fallback: string): Promise<ActionResult> {
  await requireLogin(secretHash);

  try {
    await work();

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : fallback };
  }
}

export async function getTrackingSummaryAction(secretHash: string): Promise<TrackingSummary> {
  await requireLogin(secretHash);

  const since = new Date(Date.now() - RECENT_SLEEP_DAYS * MILLISECONDS_PER_DAY).toISOString();
  const [latestBottle, latestDiaper, latestMedicine, recentSleeps, settings] = await Promise.all([
    getLatestBottle(),
    getLatestDiaper(),
    getLatestMedicine(),
    listSleeps(since),
    getSettings(),
  ]);

  return { latestBottle, latestDiaper, latestMedicine, recentSleeps, settings };
}

export async function getTrackingLogAction(secretHash: string): Promise<TrackingLog> {
  await requireLogin(secretHash);

  const [bottles, diapers, medicines, sleeps, settings] = await Promise.all([listBottles(), listDiapers(), listMedicines(), listSleeps(), getSettings()]);

  return { bottles, diapers, medicines, settings, sleeps };
}

export async function getSleepAction(secretHash: string, id: number): Promise<null | Sleep> {
  await requireLogin(secretHash);

  return getSleep(id);
}

export async function getBottleAction(secretHash: string, id: number): Promise<Bottle | null> {
  await requireLogin(secretHash);

  return getBottle(id);
}

export async function getDiaperAction(secretHash: string, id: number): Promise<Diaper | null> {
  await requireLogin(secretHash);

  return getDiaper(id);
}

export async function getMedicineAction(secretHash: string, id: number): Promise<Medicine | null> {
  await requireLogin(secretHash);

  return getMedicine(id);
}

/**
 * The suggestions for the medicine name: everything given before, and the defaults that have not been.
 */
export async function listMedicineNamesAction(secretHash: string): Promise<string[]> {
  await requireLogin(secretHash);

  const names = await listMedicineNames();
  const given = new Set(names.map((name) => name.toLowerCase()));

  return [...names, ...DEFAULT_MEDICINE_NAMES.filter((name) => !given.has(name.toLowerCase()))];
}

export async function saveSleepAction(secretHash: string, id: null | number, input: SleepInput): Promise<ActionResult> {
  return attempt(secretHash, async () => saveSleep(id, input), 'Could not save the sleep.');
}

export async function saveBottleAction(secretHash: string, id: null | number, input: BottleInput): Promise<ActionResult> {
  return attempt(secretHash, async () => saveBottle(id, input), 'Could not save the bottle.');
}

export async function saveDiaperAction(secretHash: string, id: null | number, input: DiaperInput): Promise<ActionResult> {
  return attempt(secretHash, async () => saveDiaper(id, input), 'Could not save the diaper.');
}

export async function saveMedicineAction(secretHash: string, id: null | number, input: MedicineInput): Promise<ActionResult> {
  return attempt(secretHash, async () => saveMedicine(id, input), 'Could not save the medicine.');
}

export async function deleteSleepAction(secretHash: string, id: number): Promise<ActionResult> {
  return attempt(secretHash, async () => deleteSleep(id), 'Could not delete the sleep.');
}

export async function deleteBottleAction(secretHash: string, id: number): Promise<ActionResult> {
  return attempt(secretHash, async () => deleteBottle(id), 'Could not delete the bottle.');
}

export async function deleteDiaperAction(secretHash: string, id: number): Promise<ActionResult> {
  return attempt(secretHash, async () => deleteDiaper(id), 'Could not delete the diaper.');
}

export async function deleteMedicineAction(secretHash: string, id: number): Promise<ActionResult> {
  return attempt(secretHash, async () => deleteMedicine(id), 'Could not delete the medicine.');
}

export async function startSleepNowAction(secretHash: string): Promise<ActionResult> {
  return attempt(secretHash, startSleepNow, 'Could not start the sleep.');
}

export async function endSleepNowAction(secretHash: string): Promise<ActionResult> {
  return attempt(secretHash, endSleepNow, 'Could not end the sleep.');
}

export async function getTrackingSettingsAction(secretHash: string): Promise<TrackingSettings> {
  await requireLogin(secretHash);

  return getSettings();
}

export async function saveTrackingSettingsAction(secretHash: string, settings: TrackingSettings): Promise<ActionResult> {
  return attempt(secretHash, async () => saveSettings(settings), 'Could not save the settings.');
}
