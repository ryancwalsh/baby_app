import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getAccessToken, getFirstCamera } from '@/services/nanit/auth';
import { connect } from '@/services/nanit/connection';

/**
 * Live audio from the nursery, as HLS.
 *
 * The camera does not offer an audio-only stream, so this asks for the same
 * MOBILE stream the phone app uses and throws the video away locally. The
 * camera already sends AAC, which is what both phones want, so ffmpeg copies
 * the audio rather than re-encoding it — the home box only demuxes.
 *
 * Segments live in a temp directory rather than under `secrets/`: they are a
 * few seconds of rolling cache, and ffmpeg deletes them as they age out.
 */

const OUTPUT_DIRECTORY = join(tmpdir(), 'baby-app-nanit-audio');
export const PLAYLIST_FILE_NAME = 'audio.m3u8';
/**
 * Short segments keep the delay down; four of them is enough of a window that
 * a phone which stalls briefly can still catch up without a gap.
 */
const SEGMENT_SECONDS = 2;
const PLAYLIST_SEGMENT_COUNT = 4;
/**
 * How long the relay runs without anyone asking for a segment before it shuts
 * itself down. A phone that is playing — including one whose screen is off —
 * fetches a segment every couple of seconds, so silence here means nobody is
 * listening, and there is no reason to keep the camera streaming.
 */
const IDLE_TIMEOUT_MILLISECONDS = 30_000;
/**
 * How long to wait before picking the stream back up after ffmpeg exits. The
 * usual cause is the access token in the RTMP URL ageing out, and the restart
 * mints a fresh one.
 */
const RESTART_DELAY_MILLISECONDS = 2_000;
/**
 * Give up on an RTMP read that stalls, so a silently dead connection becomes an
 * exit — and therefore a restart — rather than a process that hangs forever.
 */
const READ_TIMEOUT_MICROSECONDS = 20_000_000;

type AudioRelay = {
  ffmpeg: ChildProcess | null;
  idleTimer: NodeJS.Timeout | null;
  /**
   * What the relay is meant to be doing, as opposed to what ffmpeg is doing
   * right now. A restart between processes is still "on".
   */
  isWanted: boolean;
  /**
   * When the last segment or playlist request came in.
   */
  lastRequestedAt: number;
  restartTimer: NodeJS.Timeout | null;
  starting: null | Promise<void>;
};

/**
 * Parked on `globalThis` for the same reason the camera connection is: `next
 * dev` re-evaluates modules on every edit, and a module-level singleton would
 * leak an ffmpeg process per hot reload.
 */
const globalForNanitAudio = globalThis as typeof globalThis & {
  nanitAudioRelay?: AudioRelay;
};

function getRelay(): AudioRelay {
  globalForNanitAudio.nanitAudioRelay ??= {
    ffmpeg: null,
    idleTimer: null,
    isWanted: false,
    lastRequestedAt: 0,
    restartTimer: null,
    starting: null,
  };

  return globalForNanitAudio.nanitAudioRelay;
}

/**
 * Asks the camera to push its MOBILE stream to Nanit's cloud relay, which is
 * where ffmpeg then reads it from. The URL is built from the baby's uid and
 * carries the access token, so it has to be rebuilt for every restart.
 */
async function startCameraStream(): Promise<string> {
  const accessToken = await getAccessToken();
  const { babyUid } = await getFirstCamera(accessToken);
  const rtmpUrl = `rtmps://media-secured.nanit.com/nanit/${babyUid}.${accessToken}`;

  const camera = await connect();
  await camera.sendRequest('PUT_STREAMING', {
    streaming: { attempts: 3, id: 'MOBILE', rtmpUrl, status: 'STARTED' },
  });

  return rtmpUrl;
}

async function stopCameraStream(): Promise<void> {
  const camera = await connect();
  await camera.sendRequest('PUT_STREAMING', {
    streaming: { id: 'MOBILE', rtmpUrl: '', status: 'STOPPED' },
  });
}

function spawnFfmpeg(rtmpUrl: string): ChildProcess {
  return spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-rw_timeout',
      String(READ_TIMEOUT_MICROSECONDS),
      '-i',
      rtmpUrl,
      /**
       * Video is discarded rather than never fetched: RTMP carries both in one
       * stream, so there is no way to ask the camera for audio alone.
       */
      '-vn',
      '-c:a',
      'copy',
      '-f',
      'hls',
      '-hls_time',
      String(SEGMENT_SECONDS),
      '-hls_list_size',
      String(PLAYLIST_SEGMENT_COUNT),
      /**
       * `delete_segments` keeps the directory from growing all night;
       * `omit_endlist` marks the playlist live rather than finished, which is
       * what stops a phone treating it as a short recording and stopping.
       */
      '-hls_flags',
      'delete_segments+omit_endlist+independent_segments',
      '-hls_segment_filename',
      join(OUTPUT_DIRECTORY, 'segment%d.ts'),
      join(OUTPUT_DIRECTORY, PLAYLIST_FILE_NAME),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}

function scheduleRestart() {
  const relay = getRelay();

  relay.restartTimer ??= setTimeout(() => {
    relay.restartTimer = null;

    if (relay.isWanted) {
      // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget from a timer; a failed restart is picked up by the next exit.
      runRelay().catch(() => {});
    }
  }, RESTART_DELAY_MILLISECONDS);
}

async function runRelay(): Promise<void> {
  const relay = getRelay();
  const rtmpUrl = await startCameraStream();

  /**
   * Asking the camera to start takes a few seconds, which is long enough for
   * someone to switch the button back off in the meantime. Spawning now would
   * leave an ffmpeg nothing owns — `stopAudio` has already been and gone, so
   * nothing would ever kill it — quietly relaying the nursery for the life of
   * the process.
   */
  if (relay.isWanted) {
    mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

    const ffmpeg = spawnFfmpeg(rtmpUrl);
    relay.ffmpeg = ffmpeg;

    /**
     * Read so the pipe cannot fill and stall ffmpeg. Errors are not surfaced
     * any further: the exit below is what the relay actually reacts to.
     */
    ffmpeg.stderr?.on('data', () => {});

    ffmpeg.on('close', () => {
      if (relay.ffmpeg === ffmpeg) {
        relay.ffmpeg = null;

        /**
         * The stream ending while it is still wanted is normal rather than
         * exceptional — the token in the URL only lasts the hour — so pick it
         * straight back up with a fresh one.
         */
        if (relay.isWanted) {
          scheduleRestart();
        }
      }
    });
  }
}

function clearTimers(relay: AudioRelay) {
  if (relay.idleTimer !== null) {
    clearInterval(relay.idleTimer);
    relay.idleTimer = null;
  }

  if (relay.restartTimer !== null) {
    clearTimeout(relay.restartTimer);
    relay.restartTimer = null;
  }
}

/**
 * Stops the relay and tells the camera to stop streaming. Safe to call when
 * nothing is running.
 */
export async function stopAudio(): Promise<void> {
  const relay = getRelay();
  const wasWanted = relay.isWanted;

  relay.isWanted = false;
  clearTimers(relay);

  if (relay.ffmpeg !== null) {
    relay.ffmpeg.kill('SIGKILL');
    relay.ffmpeg = null;
  }

  rmSync(OUTPUT_DIRECTORY, { force: true, recursive: true });

  if (wasWanted) {
    await stopCameraStream();
  }
}

/**
 * A start that failed must not leave the relay looking wanted, or the idle
 * timer would keep a dead relay "on" and the button would lie about it.
 */
async function startRelay(): Promise<void> {
  const relay = getRelay();

  try {
    await runRelay();
  } catch (error) {
    await stopAudio();
    throw error;
  } finally {
    relay.starting = null;
  }
}

/**
 * Starts the relay if it is not already running, and marks it wanted for
 * another `IDLE_TIMEOUT_MILLISECONDS`. Every playlist and segment request calls
 * this, so a phone that keeps playing keeps the stream alive and one that stops
 * lets it fall away on its own.
 *
 * Idempotent, and safe to call concurrently: overlapping callers await the same
 * in-flight start rather than spawning an ffmpeg each.
 */
export function keepAudioRunning(): Promise<void> {
  const relay = getRelay();
  relay.lastRequestedAt = Date.now();

  if (relay.isWanted) {
    return Promise.resolve();
  }

  relay.isWanted = true;

  relay.idleTimer ??= setInterval(() => {
    if (Date.now() - relay.lastRequestedAt > IDLE_TIMEOUT_MILLISECONDS) {
      // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget from a timer; a camera that will not answer still leaves the relay stopped locally.
      stopAudio().catch(() => {});
    }
  }, IDLE_TIMEOUT_MILLISECONDS);

  relay.starting ??= startRelay();

  return relay.starting;
}

/**
 * The playlist as it stands, or null until ffmpeg has written one. A phone
 * asking this early is normal: the camera takes a moment to start pushing.
 */
export function readPlaylist(): null | string {
  const path = join(OUTPUT_DIRECTORY, PLAYLIST_FILE_NAME);

  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * One segment by name. The name is checked against the pattern ffmpeg writes
 * rather than trusted, so a request cannot reach back out of the directory.
 */
export function readSegment(fileName: string): Buffer | null {
  if (/^segment\d+\.ts$/u.test(fileName)) {
    const path = join(OUTPUT_DIRECTORY, fileName);

    return existsSync(path) ? readFileSync(path) : null;
  }

  return null;
}
