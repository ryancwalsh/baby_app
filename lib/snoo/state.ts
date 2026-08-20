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

/**
 * Levels the bassinet reports when it has stopped itself and will not start
 * again unattended. Distinct from ONLINE, which is a healthy idle.
 */
const FAULT_LEVELS = new Set(['SUSPENDED', 'UNRECOVERABLE_ERROR', 'UNRECOVERABLE_SUSPENDED']);

export type SnooStatus = 'error' | 'off' | 'on';

export type SnooState = {
  /**
   * Both safety clips fastened, as the bassinet last reported them. This is
   * why a start was refused rather than whether it was: the refusal itself is
   * `isRefused`, and this only supplies the explanation.
   */
  areClipsFastened: boolean;
  /**
   * Epoch milliseconds of the last announcement heard from the bassinet, or
   * null when nothing has ever been heard. A staleness hint only: an old
   * timestamp does not make the state wrong, it makes it unconfirmed.
   */
  heardAt: null | number;
  isOn: boolean;
  /**
   * Set when a start was sent and the bassinet answered that it is still
   * stopped — the motor declining to run, which is what happens when the baby
   * is not clipped in. Cleared the moment it is seen running, or when the
   * button is used to stop it, so it never outlives the press it describes.
   */
  isRefused: boolean;
  /**
   * The state machine's own label: ONLINE while stopped, then BASELINE through
   * LEVEL4 while soothing. Kept because it is what the device actually speaks,
   * and because it says how hard the Snoo is working, which a boolean cannot.
   */
  level: string;
};

/**
 * A refused start and a fault are both "asked, and it is not running", which
 * the button shows as one state rather than two: at night the useful
 * distinction is between working and needing a hand, not between causes.
 */
export function getSnooStatus(state: SnooState): SnooStatus {
  let status: SnooStatus = 'off';

  if (state.isRefused || FAULT_LEVELS.has(state.level)) {
    status = 'error';
  } else if (state.isOn) {
    status = 'on';
  }

  return status;
}

/**
 * What the button says on hover, and what a screen reader is told.
 */
export function describeSnoo(state: SnooState): string {
  const status = getSnooStatus(state);
  let description = 'Off';

  if (status === 'error' && !state.areClipsFastened) {
    description = 'The Snoo will not start. Check the safety clips.';
  } else if (status === 'error') {
    description = `The Snoo will not start (${state.level}).`;
  } else if (status === 'on') {
    description = state.level;
  }

  return description;
}
