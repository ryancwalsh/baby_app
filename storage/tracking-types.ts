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
  amountMilliliters: number;
  drankMilliliters: null | number;
  id: number;
  note: string;
  preparedAt: string;
  touchedLipsAt: null | string;
};

export type Diaper = {
  changedAt: string;
  id: number;
  note: string;
};

export const PREDICTION_METHODS = ['fixed', 'learned', 'age'] as const;

export type PredictionMethod = (typeof PREDICTION_METHODS)[number];

export type TrackingSettings = {
  /**
   * `YYYY-MM-DD`, only needed for the age-based method.
   */
  birthDate: null | string;
  predictionMethod: PredictionMethod;
  /**
   * Awake time before each sleep of the day, in minutes: one per nap, then the one before bed.
   */
  threeNapWakeWindowMinutes: number[];
  twoNapWakeWindowMinutes: number[];
};

export const TWO_NAP_WINDOW_COUNT = 3;
export const THREE_NAP_WINDOW_COUNT = 4;

export type SleepInput = Omit<Sleep, 'id'>;
export type BottleInput = Omit<Bottle, 'id'>;
export type DiaperInput = Omit<Diaper, 'id'>;
