import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { getAccessToken, getFirstCamera, TOKEN_LIFETIME_MILLISECONDS } from '@/services/nanit/auth';
import { MINIMUM_BRIGHTNESS } from '@/services/nanit/brightness';
import { type CameraConnection, connectToCamera } from '@/services/nanit/camera';

const STATE_DIRECTORY = 'secrets';
const STATE_FILE_PATH = `${STATE_DIRECTORY}/nanit-night-light.json`;
const RECONNECT_DELAY_MILLISECONDS = 5_000;
/**
 * How often to re-read brightness. The camera announces on/off the moment it
 * changes but says nothing about brightness, so that one value has to be asked
 * for. This is one frame on an already-open socket, not a new connection, and
 * it happens once for the whole server no matter how many pages are open.
 */
const BRIGHTNESS_POLL_MILLISECONDS = 30_000;
/**
 * How long to hold one socket before replacing it. The camera authorises a
 * connection once, with the access token it was opened with, and then goes on
 * announcing state whether or not that token is still good — so a socket held
 * past its token looks perfectly healthy while quietly answering nothing. That
 * is what left every press timing out until the process was restarted.
 *
 * Just past the point where `getAccessToken` mints a new one, so the reconnect
 * is guaranteed a fresh token rather than the tail of the old one.
 */
const RECYCLE_MILLISECONDS = TOKEN_LIFETIME_MILLISECONDS + 60_000;

export type NightLightState = {
  brightness: number;
  isOn: boolean;
};

/**
 * One connection for the whole server process, held open.
 *
 * This is what makes the night light quick and its state knowable. A per-request
 * socket cost a token check, a REST call and a TLS handshake before it could
 * send anything, and it closed before the camera got round to announcing
 * on/off — which is why that state used to be unknown. Held open, a button
 * press is one frame on an existing socket, and every announcement the camera
 * makes (including changes made from the phone app) lands in `state`.
 */
type StateListener = (state: NightLightState) => void;

type SharedConnection = {
  brightnessTimer: NodeJS.Timeout | null;
  camera: CameraConnection | null;
  connecting: null | Promise<CameraConnection>;
  /**
   * Open SSE streams, told the moment the camera announces anything.
   */
  listeners: Set<StateListener>;
  reconnectTimer: NodeJS.Timeout | null;
  /**
   * Closes this socket before its token expires — see RECYCLE_MILLISECONDS.
   */
  recycleTimer: NodeJS.Timeout | null;
  state: NightLightState;
};

/**
 * Parked on `globalThis` because `next dev` re-evaluates modules on every edit,
 * and a module-level singleton would leak a socket per hot reload.
 */
const globalForNanit = globalThis as typeof globalThis & {
  nanitConnection?: SharedConnection;
};

function readSavedState(): NightLightState | null {
  let state: NightLightState | null = null;
  if (existsSync(STATE_FILE_PATH)) {
    state = JSON.parse(readFileSync(STATE_FILE_PATH, 'utf8')) as NightLightState;
  }

  return state;
}

function saveState(state: NightLightState) {
  mkdirSync(STATE_DIRECTORY, { recursive: true });
  writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
}

/**
 * Persisted so a restart does not throw away what the camera told us. It is
 * last-known rather than verified: the light can only be read back while
 * something is listening, so a change made while this process was down is
 * invisible until the camera next announces one.
 */
function getShared(): SharedConnection {
  globalForNanit.nanitConnection ??= {
    brightnessTimer: null,
    camera: null,
    connecting: null,
    listeners: new Set(),
    reconnectTimer: null,
    recycleTimer: null,
    state: readSavedState() ?? {
      brightness: MINIMUM_BRIGHTNESS,
      isOn: false,
    },
  };

  return globalForNanit.nanitConnection;
}

function updateState(changes: Partial<NightLightState>) {
  const shared = getShared();
  const updated = { ...shared.state, ...changes };

  if (updated.isOn !== shared.state.isOn || updated.brightness !== shared.state.brightness) {
    shared.state = updated;
    saveState(updated);

    /**
     * Told only on a real change, so a browser is not woken for a repeat of
     * what it already shows. This is what makes a change made in the Nanit app
     * appear here without a refresh.
     */
    for (const listener of shared.listeners) {
      listener(updated);
    }
  }
}

/**
 * The state as last known, with no network involved, so callers stay cheap.
 */
export function getNightLightState(): NightLightState {
  return getShared().state;
}

async function openConnection(): Promise<CameraConnection> {
  const shared = getShared();
  const accessToken = await getAccessToken();
  const { cameraUid } = await getFirstCamera(accessToken);

  const camera = await connectToCamera(cameraUid, accessToken, {
    onBrightness: (brightness) => updateState({ brightness }),
    onClose: () => {
      shared.camera = null;

      if (shared.brightnessTimer !== null) {
        clearInterval(shared.brightnessTimer);
        shared.brightnessTimer = null;
      }

      if (shared.recycleTimer !== null) {
        clearTimeout(shared.recycleTimer);
        shared.recycleTimer = null;
      }

      /**
       * Reconnect unprompted: an idle socket is what keeps app-driven changes
       * visible, so it is worth holding even when nobody is pressing anything.
       */
      shared.reconnectTimer ??= setTimeout(() => {
        shared.reconnectTimer = null;

        connect().catch(() => {});
      }, RECONNECT_DELAY_MILLISECONDS);
    },
    onNightLight: (isOn) => updateState({ isOn }),
  });

  shared.camera = camera;

  /**
   * Started once per connection, so brightness changed from the Nanit app is
   * picked up and pushed to any open page. Announcements cover on/off already.
   */
  shared.brightnessTimer ??= setInterval(() => {
    // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget from a timer; a failed read just waits for the next tick.
    camera.sendRequest('GET_SETTINGS', { getSettings: { all: true } }).catch(() => {});
  }, BRIGHTNESS_POLL_MILLISECONDS);

  /**
   * Closing is all this has to do: `onClose` clears the timers and reconnects,
   * which is where the fresh token comes from.
   */
  shared.recycleTimer ??= setTimeout(() => {
    camera.close();
  }, RECYCLE_MILLISECONDS);

  return camera;
}

/**
 * Subscribes to state changes. Returns the function that unsubscribes, which
 * the stream must call when the browser goes away, or listeners accumulate for
 * the life of the process.
 */
export function subscribeToNightLight(listener: StateListener): () => void {
  const shared = getShared();
  shared.listeners.add(listener);

  return () => {
    shared.listeners.delete(listener);
  };
}

/**
 * Asks the camera for its brightness and waits for the answer, so a caller that
 * is about to render gets the camera's value rather than yesterday's cache.
 * Read-only. Failure leaves the cache alone rather than throwing: a page should
 * still load when the camera is unreachable.
 */
export async function syncFromCamera(): Promise<NightLightState> {
  try {
    const camera = await connect();
    await camera.sendRequest('GET_SETTINGS', { getSettings: { all: true } });
  } catch {
    /**
     * Kept as last known — see the note on the state file above.
     */
  }

  return getNightLightState();
}

/**
 * Idempotent, and safe to call concurrently: overlapping callers await the same
 * in-flight connection rather than opening a socket each.
 */
export function connect(): Promise<CameraConnection> {
  const shared = getShared();

  if (shared.camera !== null) {
    return Promise.resolve(shared.camera);
  }

  // eslint-disable-next-line promise/prefer-await-to-then -- This function is synchronous on purpose, so overlapping callers share one in-flight promise.
  shared.connecting ??= openConnection().finally(() => {
    shared.connecting = null;
  });

  return shared.connecting;
}

export async function sendToCamera(type: string, payload: Record<string, unknown>, changes: Partial<NightLightState>): Promise<NightLightState> {
  const camera = await connect();
  await camera.sendRequest(type, payload);
  /**
   * The camera acknowledged the write, so the new value is known even if it
   * never announces one. Announcements refine this; they are not needed for it.
   */
  updateState(changes);
  return getNightLightState();
}
