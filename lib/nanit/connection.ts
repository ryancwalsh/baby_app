import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { getAccessToken, getFirstCamera } from '@/lib/nanit/auth';
import { MINIMUM_BRIGHTNESS } from '@/lib/nanit/brightness';
import { type CameraConnection, connectToCamera } from '@/lib/nanit/camera';

const STATE_DIRECTORY = 'secrets';
const STATE_FILE_PATH = `${STATE_DIRECTORY}/nanit-night-light.json`;
const RECONNECT_DELAY_MILLISECONDS = 5_000;

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
type SharedConnection = {
  camera: CameraConnection | null;
  connecting: null | Promise<CameraConnection>;
  reconnectTimer: NodeJS.Timeout | null;
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
  if (globalForNanit.nanitConnection === undefined) {
    globalForNanit.nanitConnection = {
      camera: null,
      connecting: null,
      reconnectTimer: null,
      state: readSavedState() ?? {
        brightness: MINIMUM_BRIGHTNESS,
        isOn: false,
      },
    };
  }

  return globalForNanit.nanitConnection;
}

function updateState(changes: Partial<NightLightState>) {
  const shared = getShared();
  const updated = { ...shared.state, ...changes };

  if (updated.isOn !== shared.state.isOn || updated.brightness !== shared.state.brightness) {
    shared.state = updated;
    saveState(updated);
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
      /**
       * Reconnect unprompted: an idle socket is what keeps app-driven changes
       * visible, so it is worth holding even when nobody is pressing anything.
       */
      if (shared.reconnectTimer === null) {
        shared.reconnectTimer = setTimeout(() => {
          shared.reconnectTimer = null;
          connect().catch(() => {});
        }, RECONNECT_DELAY_MILLISECONDS);
      }
    },
    onNightLight: (isOn) => updateState({ isOn }),
  });

  shared.camera = camera;
  /**
   * Brightness, unlike on/off, can be read back, so ask once per connection and
   * let the cache correct itself. Read-only, and not awaited: a press should not
   * queue behind it, and a camera that ignores it should not block the socket.
   */
  camera.sendRequest('GET_SETTINGS', { getSettings: { all: true } }).catch(() => {});

  return camera;
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

  if (shared.connecting === null) {
    shared.connecting = openConnection().finally(() => {
      shared.connecting = null;
    });
  }

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
