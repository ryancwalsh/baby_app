/**
 * Shared with client components, so nothing here may pull in `mqtt` or Node —
 * the same split as lib/nanit/brightness.ts.
 */

/**
 * The bassinet has no on/off. It runs a state machine, and ONLINE is the state
 * it sits in when it is awake but doing nothing, which is what "off" means to
 * anyone looking at the button.
 */
export const STOPPED_LEVEL = 'ONLINE';

export type SnooState = {
  /**
   * Epoch milliseconds of the last announcement heard from the bassinet, or
   * null when nothing has ever been heard. A staleness hint only: an old
   * timestamp does not make the state wrong, it makes it unconfirmed.
   */
  heardAt: null | number;
  isOn: boolean;
  /**
   * The state machine's own label: ONLINE while stopped, then BASELINE through
   * LEVEL4 while soothing. Kept because it is what the device actually speaks,
   * and because it says how hard the Snoo is working, which a boolean cannot.
   */
  level: string;
};
