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

/**
 * What the bassinet itself has said, and the only part of the state worth
 * keeping on disk. Everything here was announced by the hardware: nothing in
 * this shape is ever set because the app hoped for it, which is what stops a
 * start that never happened from surviving a restart as a cheerful "on".
 */
export type SnooReport = {
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
   * The state machine's own label: ONLINE while stopped, then BASELINE through
   * LEVEL4 while soothing. Kept because it is what the device actually speaks,
   * and because it says how hard the Snoo is working, which a boolean cannot.
   */
  level: string;
};

/**
 * The report plus the two facts that belong to this process rather than to the
 * bassinet. Both are deliberately not persisted: a refusal describes one press,
 * and reachability describes one connection, so neither survives a restart as
 * something to be believed.
 */
export type SnooState = {
  /**
   * Whether the shared connection is open right now. A bassinet we cannot hear
   * from is a reachability problem, never an on/off one — the same distinction
   * the plugs make.
   */
  isReachable: boolean;
  /**
   * Set when a start was sent and the bassinet did not go on to run — the motor
   * declining, which is what happens when the baby is not clipped in. Cleared
   * the moment it is seen running, or when the button is used to stop it, so it
   * never outlives the press it describes.
   */
  isRefused: boolean;
} & SnooReport;

/**
 * A refused start, a fault and a bassinet we cannot reach are all "not running,
 * and not because anyone asked for that", which the button shows as one state
 * rather than three: at night the useful distinction is between working and
 * needing a hand, not between causes.
 */
export function getSnooStatus(state: SnooState): SnooStatus {
  let status: SnooStatus = 'off';

  if (!state.isReachable || state.isRefused || FAULT_LEVELS.has(state.level)) {
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

  if (!state.isReachable) {
    description = 'Could not reach the Snoo.';
  } else if (status === 'error' && !state.areClipsFastened) {
    description = 'The Snoo will not start. Check the safety clips.';
  } else if (status === 'error' && state.isRefused) {
    description = 'The Snoo did not start.';
  } else if (status === 'error') {
    description = `The Snoo will not start (${state.level}).`;
  } else if (status === 'on') {
    description = state.level;
  }

  return description;
}
