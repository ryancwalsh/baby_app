import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { connectAsync, type MqttClient } from 'mqtt';

import { getFirstSnoo, getIdToken, type SnooDevice } from '@/lib/snoo/auth';
import { type SnooState, STOPPED_LEVEL } from '@/lib/snoo/state';

const STATE_DIRECTORY = 'secrets';
const STATE_FILE_PATH = `${STATE_DIRECTORY}/snoo-state.json`;
const RECONNECT_DELAY_MILLISECONDS = 5_000;
const CONNECT_TIMEOUT_MILLISECONDS = 10_000;
/**
 * How long a press waits for the bassinet to say what it did. Long enough for
 * an answer over the cloud, short enough that a silent bassinet does not hold
 * a thumb on the button.
 */
const CONFIRMATION_MILLISECONDS = 4_000;
/**
 * MQTT 3.1 rather than 3.1.1, which is what the Happiest Baby app itself
 * speaks. The protocol id changes with it: 3.1 is "MQIsdp".
 */
const MQTT_3_1 = { protocolId: 'MQIsdp', protocolVersion: 3 } as const;
/**
 * AWS IoT reads the SDK it is talking to out of the username. Nothing checks
 * it, but it is what the app sends.
 */
const IOT_USER_NAME = '?SDK=iOS&Version=2.40.1';

/**
 * One announcement from the bassinet. Cry detection and signal strength are
 * ignored; the clips are not, because they are what explains a refusal.
 */
type ActivityState = {
  left_safety_clip?: number;
  right_safety_clip?: number;
  state_machine?: {
    state?: string;
  };
};

/**
 * Told when the bassinet has said something, so a command can wait for the
 * answer to its own press rather than reporting what it hoped for.
 */
type Waiter = () => void;

type SharedConnection = {
  client: MqttClient | null;
  connecting: null | Promise<MqttClient>;
  device: null | SnooDevice;
  state: SnooState;
  waiters: Set<Waiter>;
};

/**
 * Parked on `globalThis` because `next dev` re-evaluates modules on every edit,
 * and a module-level singleton would leak a connection per hot reload.
 */
const globalForSnoo = globalThis as typeof globalThis & {
  snooConnection?: SharedConnection;
};

const UNKNOWN_STATE: SnooState = {
  areClipsFastened: true,
  heardAt: null,
  isOn: false,
  isRefused: false,
  level: STOPPED_LEVEL,
};

/**
 * Merged over the defaults rather than trusted whole, so a file written by an
 * older build is missing fields rather than broken by them.
 */
function readSavedState(): SnooState {
  let state = UNKNOWN_STATE;
  if (existsSync(STATE_FILE_PATH)) {
    state = { ...UNKNOWN_STATE, ...(JSON.parse(readFileSync(STATE_FILE_PATH, 'utf8')) as Partial<SnooState>) };
  }

  return state;
}

function saveState(state: SnooState) {
  mkdirSync(STATE_DIRECTORY, { recursive: true });
  writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
}

/**
 * Persisted so a restart does not throw away what the bassinet last said. Like
 * the night light, it is last-known rather than verified: a session started
 * from the Happiest Baby app while this process was down is invisible until the
 * bassinet next announces something.
 */
function getShared(): SharedConnection {
  globalForSnoo.snooConnection ??= {
    client: null,
    connecting: null,
    device: null,
    state: readSavedState(),
    waiters: new Set(),
  };

  return globalForSnoo.snooConnection;
}

function updateState(changes: Partial<SnooState>) {
  const shared = getShared();
  shared.state = { ...shared.state, ...changes };
  saveState(shared.state);
}

/**
 * The state as last known, with no network involved, so callers stay cheap.
 */
export function getSnooState(): SnooState {
  return getShared().state;
}

/**
 * A clip reports 1 when it is fastened. Anything else counts as undone, but an
 * absent field does not: a message that says nothing about the clips is not
 * evidence that they are off, and treating it as such would raise an alarm
 * over a missing field.
 */
function readClips(announcement: ActivityState, fallback: boolean): boolean {
  const { left_safety_clip: left, right_safety_clip: right } = announcement;
  let areFastened = fallback;

  if (left !== undefined && right !== undefined) {
    areFastened = left === 1 && right === 1;
  }

  return areFastened;
}

function handleAnnouncement(payload: Buffer) {
  const shared = getShared();
  const announcement = JSON.parse(payload.toString('utf8')) as ActivityState;
  const level = announcement.state_machine?.state;

  if (level !== undefined) {
    const isOn = level !== STOPPED_LEVEL;
    /**
     * Every level other than ONLINE means the bassinet is running, so the
     * button follows the state machine rather than a separate flag. Seeing it
     * run also settles any refusal: whatever was wrong no longer is.
     */
    updateState({
      areClipsFastened: readClips(announcement, shared.state.areClipsFastened),
      heardAt: Date.now(),
      isOn,
      isRefused: isOn ? false : shared.state.isRefused,
      level,
    });

    for (const waiter of shared.waiters) {
      waiter();
    }
  }
}

/**
 * Resolves on the next announcement, or when the wait runs out — never
 * rejects, because a quiet bassinet is not an error, just an unconfirmed one.
 */
function waitForAnnouncement(): Promise<void> {
  const shared = getShared();

  return new Promise((resolve) => {
    const waiter = () => {
      shared.waiters.delete(waiter);
      resolve();
    };

    shared.waiters.add(waiter);
    /**
     * Left to fire even when an announcement gets there first: by then the
     * waiter has removed itself and resolving again does nothing, which is
     * cheaper than the bookkeeping to cancel it.
     */
    setTimeout(waiter, CONFIRMATION_MILLISECONDS);
  });
}

async function openConnection(): Promise<MqttClient> {
  const shared = getShared();
  const idToken = await getIdToken();
  const device = await getFirstSnoo(idToken);

  const client = await connectAsync(`wss://${device.clientEndpoint}:443/mqtt`, {
    ...MQTT_3_1,
    clientId: `baby-app-${randomUUID()}`,
    connectTimeout: CONNECT_TIMEOUT_MILLISECONDS,
    /**
     * Reconnecting unprompted is what keeps a session started from the
     * Happiest Baby app visible here, so the connection is worth holding even
     * when nobody is pressing anything.
     */
    reconnectPeriod: RECONNECT_DELAY_MILLISECONDS,
    username: IOT_USER_NAME,
    /**
     * The id token rides as a websocket header rather than an MQTT password.
     */
    wsOptions: { headers: { token: idToken } },
  });

  client.on('message', (_topic, payload) => {
    handleAnnouncement(payload);
  });

  /**
   * Subscribing is a read. It is what makes the state knowable at all: the
   * bassinet announces every change, including ones made from the app.
   */
  await client.subscribeAsync(`${device.thingName}/state_machine/activity_state`);

  shared.client = client;
  shared.device = device;

  return client;
}

/**
 * Idempotent, and safe to call concurrently: overlapping callers await the same
 * in-flight connection rather than opening one each.
 */
export function connect(): Promise<MqttClient> {
  const shared = getShared();

  if (shared.client !== null) {
    return Promise.resolve(shared.client);
  }

  // eslint-disable-next-line promise/prefer-await-to-then -- This function is synchronous on purpose, so overlapping callers share one in-flight promise.
  shared.connecting ??= openConnection().finally(() => {
    shared.connecting = null;
  });

  return shared.connecting;
}

/**
 * Opens the connection and returns what is known, without ever writing. This is
 * what a page load calls: it starts the listening that keeps the state fresh,
 * and it cannot itself change anything in the room. Failure leaves the cache
 * alone rather than throwing, so the page still renders when the cloud is down.
 */
export async function readSnoo(): Promise<SnooState> {
  try {
    await connect();
  } catch {
    /**
     * Kept as last known — see the note on the state file above.
     */
  }

  return getSnooState();
}

async function sendCommand(command: string, extras: Record<string, string> = {}): Promise<void> {
  const client = await connect();
  const { device } = getShared();

  if (device === null) {
    throw new Error('Connected without a Snoo, which should not be possible.');
  }

  await client.publishAsync(
    `${device.thingName}/state_machine/control`,
    /**
     * The timestamp is in ten-millionths of a second, which is what the app
     * sends: seconds since the epoch times ten million.
     */
    JSON.stringify({ command, ts: Date.now() * 10_000, ...extras }),
  );
}

/**
 * Starting and stopping are different commands rather than one with a flag, so
 * the boolean is turned into the right one here. Stopping is a move to ONLINE
 * with the hold released, which is what the app's stop button does.
 *
 * A press then waits for the bassinet's own answer, because a start can be
 * declined — most often because the baby is not clipped in, and the motor will
 * not run without that. Waiting is what lets the button say so instead of
 * showing a cheerful "on" over a bassinet that never moved.
 */
export async function setSnooPower(isOn: boolean): Promise<SnooState> {
  const heardBefore = getSnooState().heardAt;

  if (isOn) {
    await sendCommand('start_snoo');
  } else {
    await sendCommand('go_to_state', { hold: 'off', state: STOPPED_LEVEL });
  }

  /**
   * Optimistic in the meantime. A publish means the command left this process,
   * not that the bassinet acted on it. `heardAt` is deliberately left alone, so
   * a state we assumed is never mistaken for one we were told.
   */
  updateState({ isOn, isRefused: false });
  await waitForAnnouncement();

  const state = getSnooState();
  /**
   * Only a bassinet that actually answered can refuse. If nothing was heard,
   * the optimistic value stands: a silent cloud is not the motor declining.
   */
  if (isOn && state.heardAt !== heardBefore && !state.isOn) {
    updateState({ isRefused: true });
  }

  return getSnooState();
}
