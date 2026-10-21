import { CAMERA_ADDRESS, type WebcamCameraState, type WebcamRole, type WebcamServerMessage, type WebcamSignal } from '@/services/webcam/messages';
import { query } from '@/storage/database';

/**
 * Introduces a camera phone to the phones watching it.
 *
 * Held in the database rather than in memory, because on serverless the camera's stream and a watcher's may be served by different instances. Each phone's stream polls for what is addressed to it once a second, and says it is still there every few seconds; a phone that stops saying so is treated as gone.
 *
 * One camera at a time. A second phone that claims it replaces the first, which
 * is told so and stops.
 */

const POLL_MILLISECONDS = 1_000;
const HEARTBEAT_MILLISECONDS = 10_000;
const GONE_AFTER_MILLISECONDS = 30_000;
const PRUNE_AFTER_MILLISECONDS = 24 * 60 * 60 * 1_000;

type Stream = {
  clientId: string;
  close: () => void;
  role: WebcamRole;
  send: (message: WebcamServerMessage) => void;
};

type CameraRow = { cameraId: string; heartbeatAt: string; startedAt: string; streamId: string };

function isAlive(heartbeatAt: string): boolean {
  return Date.now() - new Date(heartbeatAt).getTime() < GONE_AFTER_MILLISECONDS;
}

async function readCamera(): Promise<CameraRow | null> {
  const [row] = (await query('SELECT camera_id, stream_id, started_at, heartbeat_at FROM webcam_camera WHERE slot = 1')).rows;

  return row === undefined ? null : { cameraId: String(row.camera_id), heartbeatAt: String(row.heartbeat_at), startedAt: String(row.started_at), streamId: String(row.stream_id) };
}

async function readLiveCamera(): Promise<CameraRow | null> {
  const camera = await readCamera();

  return camera !== null && isAlive(camera.heartbeatAt) ? camera : null;
}

export async function getCameraState(): Promise<WebcamCameraState> {
  const camera = await readLiveCamera();

  return { startedAt: camera === null ? null : new Date(camera.startedAt).getTime() };
}

async function queueSignal(recipientId: string, signal: WebcamSignal) {
  await query('INSERT INTO webcam_signals (recipient_id, message, created_at) VALUES (?, ?, ?)', [
    recipientId,
    JSON.stringify({ signal, type: 'signal' }),
    new Date().toISOString(),
  ]);
}

async function readLiveWatcherIds(): Promise<string[]> {
  const cutoff = new Date(Date.now() - GONE_AFTER_MILLISECONDS).toISOString();

  return (await query('SELECT watcher_id FROM webcam_watchers WHERE heartbeat_at > ?', [cutoff])).rows.map((row) => String(row.watcher_id));
}

/**
 * Claims the camera slot. Returns false when this camera was replaced earlier: an event stream reconnects on its own, so without the retired list a replaced camera that happened to be offline at the time would come back and take the slot from its successor.
 */
async function claimCamera(stream: Stream, streamId: string): Promise<boolean> {
  const retired = await query('SELECT 1 FROM webcam_retired_cameras WHERE camera_id = ?', [stream.clientId]);
  let isClaimed = false;

  if (retired.rows.length === 0) {
    const previous = await readCamera();
    const now = new Date().toISOString();

    if (previous !== null && previous.cameraId !== stream.clientId) {
      await query('INSERT OR IGNORE INTO webcam_retired_cameras (camera_id, retired_at) VALUES (?, ?)', [previous.cameraId, now]);
    }

    /**
     * The same camera coming back keeps its start time: to the people watching
     * it is the same camera, and its stream merely blinked.
     */
    const startedAt = previous?.cameraId === stream.clientId ? previous.startedAt : now;
    await query(
      'INSERT INTO webcam_camera (slot, camera_id, stream_id, started_at, heartbeat_at) VALUES (1, ?, ?, ?, ?) ON CONFLICT (slot) DO UPDATE SET camera_id = excluded.camera_id, stream_id = excluded.stream_id, started_at = excluded.started_at, heartbeat_at = excluded.heartbeat_at',
      [stream.clientId, streamId, startedAt, now],
    );
    stream.send({ startedAt: new Date(startedAt).getTime(), type: 'camera' });

    /**
     * Everyone already waiting gets an offer. The camera ignores this for a
     * watcher it is still connected to, so a blink in its stream does not
     * interrupt the picture.
     */
    for (const watcherId of await readLiveWatcherIds()) {
      await queueSignal(stream.clientId, { from: watcherId, to: stream.clientId, type: 'hello' });
    }

    const pruneBefore = new Date(Date.now() - PRUNE_AFTER_MILLISECONDS).toISOString();
    await query('DELETE FROM webcam_signals WHERE created_at < ?', [pruneBefore]);
    await query('DELETE FROM webcam_retired_cameras WHERE retired_at < ?', [pruneBefore]);
    await query('DELETE FROM webcam_watchers WHERE heartbeat_at < ?', [pruneBefore]);
    isClaimed = true;
  }

  return isClaimed;
}

async function addWatcher(stream: Stream, streamId: string) {
  await query(
    'INSERT INTO webcam_watchers (watcher_id, stream_id, heartbeat_at) VALUES (?, ?, ?) ON CONFLICT (watcher_id) DO UPDATE SET stream_id = excluded.stream_id, heartbeat_at = excluded.heartbeat_at',
    [stream.clientId, streamId, new Date().toISOString()],
  );

  const camera = await readLiveCamera();
  if (camera !== null) {
    await queueSignal(camera.cameraId, { from: stream.clientId, to: camera.cameraId, type: 'hello' });
  }
}

async function deliverSignals(stream: Stream) {
  const rows = (await query('SELECT id, message FROM webcam_signals WHERE recipient_id = ? ORDER BY id', [stream.clientId])).rows;
  const lastRow = rows.at(-1);

  if (lastRow !== undefined) {
    for (const row of rows) {
      stream.send(JSON.parse(String(row.message)) as WebcamServerMessage);
    }

    await query('DELETE FROM webcam_signals WHERE recipient_id = ? AND id <= ?', [stream.clientId, Number(lastRow.id)]);
  }
}

async function sayStillHere(stream: Stream, streamId: string) {
  const now = new Date().toISOString();
  await (stream.role === 'camera'
    ? query('UPDATE webcam_camera SET heartbeat_at = ? WHERE slot = 1 AND stream_id = ?', [now, streamId])
    : query('UPDATE webcam_watchers SET heartbeat_at = ? WHERE watcher_id = ? AND stream_id = ?', [now, stream.clientId, streamId]));
}

export type Signaling = {
  /**
   * The phone went away: stop, and give up its place.
   */
  leave: () => Promise<void>;
  /**
   * The stream is ending itself so that the phone reconnects: stop, and keep its place for the reconnect.
   */
  stop: () => void;
};

/**
 * Runs one phone's side of the introductions until it is stopped.
 *
 * A watcher going away does not tell the camera to hang up. The picture and the sound do not travel over this stream, and a phone that has gone to the background may drop the stream while still playing — hanging up would cut the sound off.
 */
export async function openSignaling(stream: Stream): Promise<Signaling> {
  const streamId = crypto.randomUUID();
  let isOpen = true;
  let lastStartedAt: null | number | undefined;
  let lastHeartbeatAt = Date.now();

  const isClaimed = stream.role === 'camera' ? await claimCamera(stream, streamId) : (await addWatcher(stream, streamId), true);

  if (!isClaimed) {
    stream.send({ type: 'replaced' });
    stream.close();
    isOpen = false;
  }

  async function poll() {
    try {
      const camera = await readLiveCamera();
      if (stream.role === 'camera' && camera !== null && camera.cameraId !== stream.clientId) {
        stream.send({ type: 'replaced' });
        stream.close();
        isOpen = false;
      } else {
        await deliverSignals(stream);
        const startedAt = camera === null ? null : new Date(camera.startedAt).getTime();
        if (stream.role === 'watcher' && startedAt !== lastStartedAt) {
          lastStartedAt = startedAt;
          stream.send({ startedAt, type: 'camera' });
        }

        if (Date.now() - lastHeartbeatAt >= HEARTBEAT_MILLISECONDS) {
          lastHeartbeatAt = Date.now();
          await sayStillHere(stream, streamId);
        }
      }
    } catch (error) {
      console.error('[webcam] could not poll for signals:', error);
    }

    if (isOpen) {
      setTimeout(poll, POLL_MILLISECONDS);
    }
  }

  if (isOpen) {
    await poll();
  }

  return {
    async leave() {
      isOpen = false;
      /**
       * Only if it is still this very stream: a reconnect may already have
       * replaced it, and clearing the slot then would orphan the new one.
       */
      await (stream.role === 'camera'
        ? query('DELETE FROM webcam_camera WHERE slot = 1 AND stream_id = ?', [streamId])
        : query('DELETE FROM webcam_watchers WHERE watcher_id = ? AND stream_id = ?', [stream.clientId, streamId]));
    },
    stop() {
      isOpen = false;
    },
  };
}

/**
 * Passes a signal to the phone it is addressed to. A signal for a phone that
 * has gone is dropped: the sender recovers by trying again.
 */
export async function relaySignal(signal: WebcamSignal): Promise<void> {
  const camera = await readLiveCamera();

  if (signal.to === CAMERA_ADDRESS || signal.to === camera?.cameraId) {
    if (camera !== null) {
      await queueSignal(camera.cameraId, signal);
    }
  } else if ((await readLiveWatcherIds()).includes(signal.to)) {
    await queueSignal(signal.to, signal);
  }
}
