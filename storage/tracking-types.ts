/**
 * Shared by the server and the pages, so it must stay free of anything Node-only — the pages import values from here, not just types.
 */

export type Sleep = {
  endedAt: null | string;
  id: number;
  note: string;
  startedAt: string;
};

export type Bottle = {
  /**
   * The prepared amount, which is optional.
   */
  amountMilliliters: null | number;
  drankMilliliters: null | number;
  id: number;
  note: string;
  preparedAt: string;
  resumedAt: null | string;
  touchedLipsAt: null | string;
};

export type Diaper = {
  changedAt: string;
  id: number;
  note: string;
};

export type Medicine = {
  amountMilliliters: number;
  givenAt: string;
  id: number;
  name: string;
  note: string;
};

/**
 * Always offered by the medicine form, even before it has ever been given.
 */
export const DEFAULT_MEDICINE_NAMES = ['Acetaminophen'];

export const PREDICTION_METHODS = ['fixed', 'learned', 'age'] as const;

export type PredictionMethod = (typeof PREDICTION_METHODS)[number];

export type TrackingSettings = {
  /**
   * `YYYY-MM-DD`, only needed for the age-based method.
   */
  birthDate: null | string;
  /**
   * `HH:MM`, local time. A sleep that starts between these two and is shorter than a night's stretch is a nap; everything else is night.
   */
  dayEndsAt: string;
  dayStartsAt: string;
  /**
   * Whether a day's totals run from midnight to midnight or from one day start time to the next.
   */
  dayTotalsFrom: DayTotalsFrom;
  predictionMethod: PredictionMethod;
  /**
   * Awake time before each sleep of the day, in minutes: one per nap, then the one before bed.
   */
  threeNapWakeWindowMinutes: number[];
  twoNapWakeWindowMinutes: number[];
};

export const DAY_TOTALS_FROM = ['midnight', 'day-start'] as const;

export type DayTotalsFrom = (typeof DAY_TOTALS_FROM)[number];

export const DEFAULT_DAY_STARTS_AT = '06:30';
export const DEFAULT_DAY_ENDS_AT = '18:00';

export const TWO_NAP_WINDOW_COUNT = 3;
export const THREE_NAP_WINDOW_COUNT = 4;

export type SleepInput = Omit<Sleep, 'id'>;
export type BottleInput = Omit<Bottle, 'id'>;
export type DiaperInput = Omit<Diaper, 'id'>;
export type MedicineInput = Omit<Medicine, 'id'>;
