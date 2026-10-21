import { query } from '@/storage/database';
import { toOptionalString, type Value } from '@/storage/tracking';
import { DEFAULT_DAY_ENDS_AT, DEFAULT_DAY_STARTS_AT, PREDICTION_METHODS, THREE_NAP_WINDOW_COUNT, type TrackingSettings, TWO_NAP_WINDOW_COUNT } from '@/storage/tracking-types';

const TIME_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

function parseWindows(value: Value, count: number): number[] {
  const parsed = JSON.parse(String(value)) as unknown;

  return Array.isArray(parsed) && parsed.length === count ? parsed.map(Number) : [];
}

export async function getSettings(): Promise<TrackingSettings> {
  const [row] = (await query('SELECT * FROM settings WHERE id = 1')).rows;
  if (row === undefined) {
    throw new Error('The settings row is missing; the first migration creates it.');
  }

  const method = String(row.prediction_method);

  return {
    birthDate: toOptionalString(row.birth_date),
    dayEndsAt: toOptionalString(row.day_ends_at) ?? DEFAULT_DAY_ENDS_AT,
    dayStartsAt: toOptionalString(row.day_starts_at) ?? DEFAULT_DAY_STARTS_AT,
    predictionMethod: PREDICTION_METHODS.find((candidate) => candidate === method) ?? 'fixed',
    threeNapWakeWindowMinutes: parseWindows(row.three_nap_wake_window_minutes, THREE_NAP_WINDOW_COUNT),
    twoNapWakeWindowMinutes: parseWindows(row.two_nap_wake_window_minutes, TWO_NAP_WINDOW_COUNT),
  };
}

function validateWindows(windows: number[], count: number, label: string): number[] {
  if (windows.length !== count || windows.some((minutes) => !Number.isInteger(minutes) || minutes <= 0)) {
    throw new Error(`${label} needs ${count} wake windows, each a whole number of minutes.`);
  }

  return windows;
}

export async function saveSettings(settings: TrackingSettings) {
  if (!PREDICTION_METHODS.includes(settings.predictionMethod)) {
    throw new Error('Unknown prediction method.');
  }

  const birthDate = settings.birthDate === null || settings.birthDate === '' ? null : settings.birthDate;
  if (birthDate !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(birthDate)) {
    throw new Error('The birth date is not a date.');
  }

  if (settings.predictionMethod === 'age' && birthDate === null) {
    throw new Error('Predicting from age needs a birth date.');
  }

  if (!TIME_OF_DAY_PATTERN.test(settings.dayStartsAt) || !TIME_OF_DAY_PATTERN.test(settings.dayEndsAt)) {
    throw new Error('The day start and end need to be times.');
  }

  /**
   * `HH:MM` strings sort in time order, so they compare as text.
   */
  if (settings.dayStartsAt >= settings.dayEndsAt) {
    throw new Error('The day has to start before it ends.');
  }

  await query(
    'UPDATE settings SET prediction_method = ?, birth_date = ?, two_nap_wake_window_minutes = ?, three_nap_wake_window_minutes = ?, day_starts_at = ?, day_ends_at = ? WHERE id = 1',
    [
      settings.predictionMethod,
      birthDate,
      JSON.stringify(validateWindows(settings.twoNapWakeWindowMinutes, TWO_NAP_WINDOW_COUNT, 'A 2-nap day')),
      JSON.stringify(validateWindows(settings.threeNapWakeWindowMinutes, THREE_NAP_WINDOW_COUNT, 'A 3-nap day')),
      settings.dayStartsAt,
      settings.dayEndsAt,
    ],
  );
}
