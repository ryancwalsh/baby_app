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
 * One announcement from the bassinet. Everything else it sends — cry
 * detection, safety clips, signal strength — is ignored, because the button
 * only asks one question.
 */
type ActivityState = {
  state_machine?: {
    state?: string;
  };
};

type SharedConnection = {
  client: MqttClient | null;
  connecting: null | Promise<MqttClient>;
  device: null | SnooDevice;
  state: SnooState;
};

/**
 * Parked on `globalThis` because `next dev` re-evaluates modules on every edit,
 * and a module-level singleton would leak a connection per hot reload.
 */
const globalForSnoo = globalThis as typeof globalThis & {
  snooConnection?: SharedConnection;
};

function readSavedState(): null | SnooState {
  let state: null | SnooState = null;
  if (existsSync(STATE_FILE_PATH)) {
    state = JSON.parse(readFileSync(STATE_FILE_PATH, 'utf8')) as SnooState;
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
    state: readSavedState() ?? { heardAt: null, isOn: false, level: STOPPED_LEVEL },
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

function handleAnnouncement(payload: Buffer) {
  const announcement = JSON.parse(payload.toString('utf8')) as ActivityState;
  const level = announcement.state_machine?.state;

  if (level !== undefined) {
    /**
     * Every level other than ONLINE means the bassinet is running, so the
     * button follows the state machine rather than a separate flag.
     */
    updateState({ heardAt: Date.now(), isOn: level !== STOPPED_LEVEL, level });
  }
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
 */
export async function setSnooPower(isOn: boolean): Promise<SnooState> {
  if (isOn) {
    await sendCommand('start_snoo');
  } else {
    await sendCommand('go_to_state', { hold: 'off', state: STOPPED_LEVEL });
  }

  /**
   * Optimistic on purpose. A publish means the command left this process, not
   * that the bassinet has acted on it — the announcement that follows is what
   * confirms the new level, usually within a second. `heardAt` is deliberately
   * left alone, so a state we assumed is never mistaken for one we were told.
   */
  updateState({ isOn });

  return getSnooState();
}
