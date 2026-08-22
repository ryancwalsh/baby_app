import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { connectAsync, type MqttClient } from 'mqtt';

import { getFirstSnoo, getIdToken, type SnooDevice } from '@/lib/snoo/auth';
import { type SnooReport, type SnooState, STOPPED_LEVEL } from '@/lib/snoo/state';

const STATE_DIRECTORY = 'secrets';
const STATE_FILE_PATH = `${STATE_DIRECTORY}/snoo-state.json`;
const RECONNECT_DELAY_MILLISECONDS = 5_000;
/**
 * Longer after an attempt that failed outright, rather than the same five
 * seconds: a dropped socket usually comes straight back, while a cloud or a
 * credential that just refused us is not going to relent within the minute.
 */
const RETRY_DELAY_MILLISECONDS = 60_000;
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

type SharedConnection = {
  client: MqttClient | null;
  connecting: null | Promise<MqttClient>;
  device: null | SnooDevice;
  /**
   * In memory rather than on disk: a refusal describes the press that provoked
   * it, and a restart is not that press.
   */
  isRefused: boolean;
  reconnectTimer: NodeJS.Timeout | null;
  report: SnooReport;
  /**
   * Told when the bassinet has said something, so a command can wait for the
   * answer to its own press rather than reporting what it hoped for.
   */
  waiters: Set<() => void>;
};

/**
 * Parked on `globalThis` because `next dev` re-evaluates modules on every edit,
 * and a module-level singleton would leak a connection per hot reload.
 */
const globalForSnoo = globalThis as typeof globalThis & {
  snooConnection?: SharedConnection;
};

const UNKNOWN_REPORT: SnooReport = {
  areClipsFastened: true,
  heardAt: null,
  isOn: false,
  level: STOPPED_LEVEL,
};

/**
 * Merged over the defaults rather than trusted whole, so a file written by an
 * older build is missing fields rather than broken by them.
 */
function readSavedReport(): SnooReport {
  let report = UNKNOWN_REPORT;
  if (existsSync(STATE_FILE_PATH)) {
    report = { ...UNKNOWN_REPORT, ...(JSON.parse(readFileSync(STATE_FILE_PATH, 'utf8')) as Partial<SnooReport>) };
  }

  return report;
}

/**
 * Written field by field, so what an older build saved and this one keeps in
 * memory — the refusal — is dropped rather than read back tomorrow as though
 * the bassinet had said it.
 */
function saveReport({ areClipsFastened, heardAt, isOn, level }: SnooReport) {
  mkdirSync(STATE_DIRECTORY, { recursive: true });
  writeFileSync(STATE_FILE_PATH, JSON.stringify({ areClipsFastened, heardAt, isOn, level }, null, 2), {
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
    isRefused: false,
    reconnectTimer: null,
    report: readSavedReport(),
    waiters: new Set(),
  };

  return globalForSnoo.snooConnection;
}

/**
 * The state as last known, with no network involved, so callers stay cheap.
 */
export function getSnooState(): SnooState {
  const { client, isRefused, report } = getShared();

  return { ...report, isReachable: client !== null && client.connected, isRefused };
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
    shared.report = {
      areClipsFastened: readClips(announcement, shared.report.areClipsFastened),
      heardAt: Date.now(),
      isOn,
      level,
    };
    shared.isRefused = isOn ? false : shared.isRefused;
    /**
     * The one place the report is written, and it only ever writes what the
     * bassinet just said. Nothing this app merely asked for reaches the file.
     */
    saveReport(shared.report);

    for (const waiter of shared.waiters) {
      waiter();
    }
  }
}

/**
 * Resolves when the bassinet reports what was asked of it, or when the wait
 * runs out — never rejects, because a quiet bassinet is not an error, just an
 * unconfirmed one.
 *
 * It waits for the state rather than for the next announcement, because the
 * bassinet often says once more where it still is before it moves, and that
 * message is not an answer to the press.
 */
function waitForState(wantedIsOn: boolean): Promise<void> {
  const shared = getShared();

  return new Promise((resolve) => {
    function stopWaiting() {
      shared.waiters.delete(hearAnnouncement);
      resolve();
    }

    function hearAnnouncement() {
      if (shared.report.isOn === wantedIsOn) {
        stopWaiting();
      }
    }

    if (shared.report.isOn === wantedIsOn) {
      /**
       * Already there, so there is nothing to wait for — the press that stops a
       * bassinet the app already knew was stopped should not sit out the full
       * wait to say so.
       */
      resolve();
    } else {
      shared.waiters.add(hearAnnouncement);
      /**
       * Left to fire even when the bassinet answers first: by then the waiter
       * has removed itself and resolving again does nothing, which is cheaper
       * than the bookkeeping to cancel it.
       */
      setTimeout(stopWaiting, CONFIRMATION_MILLISECONDS);
    }
  });
}

/**
 * Dropped connections are reopened here rather than by `mqtt`'s own reconnect,
 * which is switched off on purpose: it would replay the websocket headers it
 * was given at connect time, and the id token in them lasts hours rather than
 * days. Going back through `openConnection` mints a fresh one every attempt,
 * which is what keeps the bassinet's state live past the first token.
 */
function scheduleReconnect(delayMilliseconds: number) {
  const shared = getShared();

  shared.reconnectTimer ??= setTimeout(() => {
    shared.reconnectTimer = null;

    /**
     * An attempt that fails schedules the next one itself. Without that, a
     * reconnect that lands during a blip would be the last one ever tried, and
     * the bassinet's state would sit frozen until somebody opened the app.
     */
    // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget from a timer, which has nowhere to await.
    connect().catch(() => {
      scheduleReconnect(RETRY_DELAY_MILLISECONDS);
    });
  }, delayMilliseconds);
}

function handleClose(client: MqttClient) {
  const shared = getShared();

  /**
   * Only the connection currently in use is worth reopening. A client that has
   * already been replaced is one `openConnection` ended on purpose, and its
   * late close event must not pull the new connection down with it.
   */
  if (shared.client === client) {
    shared.client = null;
    scheduleReconnect(RECONNECT_DELAY_MILLISECONDS);
  }
}

async function openConnection(): Promise<MqttClient> {
  const shared = getShared();

  if (shared.client !== null) {
    shared.client.end(true);
    shared.client = null;
  }

  const idToken = await getIdToken();
  const device = await getFirstSnoo(idToken);

  const client = await connectAsync(`wss://${device.clientEndpoint}:443/mqtt`, {
    ...MQTT_3_1,
    clientId: `baby-app-${randomUUID()}`,
    connectTimeout: CONNECT_TIMEOUT_MILLISECONDS,
    /**
     * See `handleClose`: reconnecting is worth doing, but not with the stale
     * credentials `mqtt` would reuse.
     */
    reconnectPeriod: 0,
    username: IOT_USER_NAME,
    /**
     * The id token rides as a websocket header rather than an MQTT password.
     */
    wsOptions: { headers: { token: idToken } },
  });

  client.on('message', (_topic, payload) => {
    handleAnnouncement(payload);
  });

  client.on('close', () => {
    handleClose(client);
  });
  /**
   * Errors arrive as a close too, so this only needs to stop them throwing.
   */
  client.on('error', () => {});

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
 *
 * A client that exists but is not connected is not a connection. Handing one
 * back is how a bassinet whose credentials had expired went on looking healthy
 * for a day: every press was accepted, queued and never sent.
 */
export function connect(): Promise<MqttClient> {
  const shared = getShared();

  if (shared.client !== null && shared.client.connected) {
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
     * Kept as last known — see the note on the state file above. The button
     * shows it as unreachable rather than as a state to be trusted, because
     * `isReachable` is read from the connection rather than from the file.
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
  const shared = getShared();

  if (isOn) {
    await sendCommand('start_snoo');
  } else {
    await sendCommand('go_to_state', { hold: 'off', state: STOPPED_LEVEL });
  }

  /**
   * The press clears the last refusal, and claims nothing else. `isOn` stays
   * whatever the bassinet last announced, so a start that never happens can no
   * longer leave an optimistic "on" behind — least of all a persisted one.
   */
  shared.isRefused = false;
  await waitForState(isOn);

  /**
   * `sendCommand` only publishes over a connected client, so silence here is
   * not the cloud being slow: it is the bassinet declining to run, which is
   * what happens when the baby is not clipped in. Whether it answered ONLINE or
   * said nothing at all, the honest answer is the same — it did not start.
   */
  if (isOn && !shared.report.isOn) {
    shared.isRefused = true;
  }

  return getSnooState();
}
