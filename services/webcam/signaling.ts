import { CAMERA_ADDRESS, type WebcamCameraState, type WebcamServerMessage, type WebcamSignal } from '@/services/webcam/messages';

/**
 * Introduces a camera phone to the phones watching it.
 *
 * Held in memory, which is only sound because there is one process — the same
 * footing as the login rate limit. A restart forgets the camera, and the camera
 * phone's event stream reconnects and claims the slot again.
 *
 * One camera at a time. A second phone that claims it replaces the first, which
 * is told so and stops.
 */

type Client = {
  close: () => void;
  id: string;
  send: (message: WebcamServerMessage) => void;
};

type Hub = {
  camera: (Client & { startedAt: number }) | null;
  /**
   * Cameras that have been replaced. An event stream reconnects on its own, so
   * without this a replaced camera that happened to be offline at the time
   * would come back and take the slot from its successor.
   */
  retiredCameraIds: Set<string>;
  watchers: Map<string, Client>;
};

/**
 * Parked on `globalThis` for the same reason the Nanit connection is: `next
 * dev` re-evaluates modules on every edit, and the route and the action must
 * see the same hub.
 */
const globalForWebcam = globalThis as typeof globalThis & {
  webcamHub?: Hub;
};

function getHub(): Hub {
  globalForWebcam.webcamHub ??= { camera: null, retiredCameraIds: new Set(), watchers: new Map() };

  return globalForWebcam.webcamHub;
}

export function getCameraState(): WebcamCameraState {
  return { startedAt: getHub().camera?.startedAt ?? null };
}

function broadcastCameraState() {
  const hub = getHub();
  const message: WebcamServerMessage = { type: 'camera', ...getCameraState() };

  for (const watcher of hub.watchers.values()) {
    watcher.send(message);
  }
}

function sendHello(camera: Client, watcherId: string) {
  camera.send({ signal: { from: watcherId, to: camera.id, type: 'hello' }, type: 'signal' });
}

/**
 * Returns what to call when this camera's stream closes.
 */
export function claimCamera(client: Client): () => void {
  const hub = getHub();

  if (hub.retiredCameraIds.has(client.id)) {
    client.send({ type: 'replaced' });
    client.close();
  } else {
    const previous = hub.camera;

    if (previous !== null && previous.id !== client.id) {
      hub.retiredCameraIds.add(previous.id);
      previous.send({ type: 'replaced' });
      previous.close();
    }

    /**
     * The same camera coming back keeps its start time: to the people watching
     * it is the same camera, and its stream merely blinked.
     */
    const startedAt = previous?.id === client.id ? previous.startedAt : Date.now();

    hub.camera = { ...client, startedAt };
    client.send({ startedAt, type: 'camera' });
    broadcastCameraState();

    /**
     * Everyone already waiting gets an offer. The camera ignores this for a
     * watcher it is still connected to, so a blink in its stream does not
     * interrupt the picture.
     */
    for (const watcherId of hub.watchers.keys()) {
      sendHello(client, watcherId);
    }
  }

  return () => {
    /**
     * Only if it is still this very stream: a reconnect may already have
     * replaced it, and clearing the slot then would orphan the new one.
     */
    if (hub.camera?.send === client.send) {
      hub.camera = null;
      broadcastCameraState();
    }
  };
}

/**
 * Returns what to call when this watcher's stream closes.
 *
 * Closing it does not tell the camera to hang up. The picture and the sound do
 * not travel over this stream, and a phone that has gone to the background may
 * drop the stream while still playing — hanging up would cut the sound off.
 */
export function addWatcher(client: Client): () => void {
  const hub = getHub();

  hub.watchers.set(client.id, client);
  client.send({ type: 'camera', ...getCameraState() });

  if (hub.camera !== null) {
    sendHello(hub.camera, client.id);
  }

  return () => {
    if (hub.watchers.get(client.id)?.send === client.send) {
      hub.watchers.delete(client.id);
    }
  };
}

/**
 * Passes a signal to the phone it is addressed to. A signal for a phone that
 * has gone is dropped: the sender recovers by trying again.
 */
export function relaySignal(signal: WebcamSignal): void {
  const hub = getHub();
  const recipient = signal.to === CAMERA_ADDRESS || signal.to === hub.camera?.id ? hub.camera : hub.watchers.get(signal.to);

  if (recipient !== null && recipient !== undefined) {
    recipient.send({ signal, type: 'signal' });
  }
}
