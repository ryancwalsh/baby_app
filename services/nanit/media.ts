import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getAccessToken, getFirstCamera } from '@/services/nanit/auth';
import { connect } from '@/services/nanit/connection';

/**
 * Live sound and pictures from the nursery, as HLS.
 *
 * The camera offers neither an audio-only nor a video-only stream: there is one
 * MOBILE stream carrying both, which is what the phone app asks for. So there
 * is one RTMP pull and one ffmpeg, and it writes two playlists — sound for the
 * listen button, pictures for the monitor page. Splitting them is what stops
 * the room being heard twice, a few seconds apart, when both are on.
 *
 * Both are copied rather than re-encoded. The camera already sends AAC and
 * H.264, which is what both phones want, so the home box only demuxes.
 *
 * Segments live in a temp directory rather than under `secrets/`: they are a
 * few seconds of rolling cache, and ffmpeg deletes them as they age out.
 */

export type MediaKind = 'audio' | 'video';

const OUTPUT_DIRECTORY = join(tmpdir(), 'baby-app-nanit-media');

export const PLAYLIST_FILE_NAMES: Record<MediaKind, string> = {
  audio: 'audio.m3u8',
  video: 'video.m3u8',
};

/**
 * Short segments keep the delay down; four of them is enough of a window that
 * a phone which stalls briefly can still catch up without a gap.
 *
 * Two seconds is honoured rather than rounded up, because the camera emits a
 * keyframe every second — measured, not assumed — and `-c:v copy` can only cut
 * a segment on one.
 */
const SEGMENT_SECONDS = 2;
const PLAYLIST_SEGMENT_COUNT = 4;
/**
 * How long a kind runs without anyone asking for a segment before it is
 * dropped. A phone that is playing — including one whose screen is off —
 * fetches a segment every couple of seconds, so silence here means nobody is
 * watching or listening. The camera is only told to stop once both are quiet.
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

type MediaRelay = {
  ffmpeg: ChildProcess | null;
  idleTimer: NodeJS.Timeout | null;
  /**
   * What each kind is meant to be doing, as opposed to what ffmpeg is doing
   * right now. A restart between processes is still "on".
   */
  isWanted: Record<MediaKind, boolean>;
  /**
   * When the last segment or playlist request came in, per kind.
   */
  lastRequestedAt: Record<MediaKind, number>;
  restartTimer: NodeJS.Timeout | null;
  starting: null | Promise<void>;
};

/**
 * Parked on `globalThis` for the same reason the camera connection is: `next
 * dev` re-evaluates modules on every edit, and a module-level singleton would
 * leak an ffmpeg process per hot reload.
 */
const globalForNanitMedia = globalThis as typeof globalThis & {
  nanitMediaRelay?: MediaRelay;
};

function getRelay(): MediaRelay {
  globalForNanitMedia.nanitMediaRelay ??= {
    ffmpeg: null,
    idleTimer: null,
    isWanted: { audio: false, video: false },
    lastRequestedAt: { audio: 0, video: 0 },
    restartTimer: null,
    starting: null,
  };

  return globalForNanitMedia.nanitMediaRelay;
}

function isAnythingWanted(relay: MediaRelay): boolean {
  return relay.isWanted.audio || relay.isWanted.video;
}

/**
 * Where the camera pushes its MOBILE stream, and where ffmpeg reads it from.
 * The URL carries the access token, so it has to be rebuilt for every restart.
 */
async function buildRtmpUrl(): Promise<string> {
  const accessToken = await getAccessToken();
  const { babyUid } = await getFirstCamera(accessToken);

  return `rtmps://media-secured.nanit.com/nanit/${babyUid}.${accessToken}`;
}

/**
 * Asks the camera to start pushing — and shrugs if it will not.
 *
 * A refusal is usually `403 Number of Mobile App connections above limit`,
 * and it does not mean there is nothing to watch. `PUT_STREAMING STOPPED` is
 * acked but not honoured, so the camera goes on publishing long after it has
 * been told to stop, and it then counts that phantom viewer against the next
 * request. Measured on 2026-09-10: with the start refused, the very same RTMP
 * URL was still serving 1080p H.264 and AAC.
 *
 * So the start is an ask rather than a precondition. If it fails, ffmpeg tries
 * the pull anyway; a camera that really is not publishing shows up as ffmpeg
 * exiting with nothing, which the playlist wait already reports.
 */
async function askCameraToStream(rtmpUrl: string): Promise<void> {
  try {
    const camera = await connect();
    await camera.sendRequest('PUT_STREAMING', {
      streaming: { attempts: 3, id: 'MOBILE', rtmpUrl, status: 'STARTED' },
    });
  } catch (error) {
    console.error('The camera refused to start streaming; reading the stream anyway.', error);
  }
}

async function stopCameraStream(): Promise<void> {
  const camera = await connect();
  await camera.sendRequest('PUT_STREAMING', {
    streaming: { id: 'MOBILE', rtmpUrl: '', status: 'STOPPED' },
  });
}

/**
 * The output half of the ffmpeg command for one kind. Both playlists are
 * written whenever the relay runs, whichever kind asked for it: they come off
 * the same stream, so the second one is a demux rather than a second pull, and
 * a phone that turns the picture on while the sound is already playing finds a
 * playlist waiting instead of waiting for the camera all over again.
 */
function buildOutputArguments(kind: MediaKind): string[] {
  const streamArguments = kind === 'audio' ? ['-map', '0:a', '-c:a', 'copy', '-vn'] : ['-map', '0:v', '-c:v', 'copy', '-an'];

  return [
    ...streamArguments,
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
    join(OUTPUT_DIRECTORY, `${kind}%d.ts`),
    join(OUTPUT_DIRECTORY, PLAYLIST_FILE_NAMES[kind]),
  ];
}

function spawnFfmpeg(rtmpUrl: string): ChildProcess {
  return spawn(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-rw_timeout', String(READ_TIMEOUT_MICROSECONDS), '-i', rtmpUrl, ...buildOutputArguments('audio'), ...buildOutputArguments('video')],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}

function scheduleRestart() {
  const relay = getRelay();

  relay.restartTimer ??= setTimeout(() => {
    relay.restartTimer = null;

    if (isAnythingWanted(relay)) {
      // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget from a timer; a failed restart is picked up by the next exit.
      runRelay().catch(() => {});
    }
  }, RESTART_DELAY_MILLISECONDS);
}

async function runRelay(): Promise<void> {
  const relay = getRelay();
  const rtmpUrl = await buildRtmpUrl();
  await askCameraToStream(rtmpUrl);

  /**
   * Asking the camera to start takes a few seconds, which is long enough for
   * someone to switch the button back off in the meantime. Spawning now would
   * leave an ffmpeg nothing owns — `stopMedia` has already been and gone, so
   * nothing would ever kill it — quietly relaying the nursery for the life of
   * the process.
   */
  if (isAnythingWanted(relay)) {
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
        if (isAnythingWanted(relay)) {
          scheduleRestart();
        }
      }
    });
  }
}

function clearTimers(relay: MediaRelay) {
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
 * Tears the relay down and tells the camera to stop streaming. Safe to call
 * when nothing is running.
 */
async function shutDown(): Promise<void> {
  const relay = getRelay();
  const wasRunning = isAnythingWanted(relay) || relay.ffmpeg !== null;

  relay.isWanted = { audio: false, video: false };
  clearTimers(relay);

  if (relay.ffmpeg !== null) {
    relay.ffmpeg.kill('SIGKILL');
    relay.ffmpeg = null;
  }

  rmSync(OUTPUT_DIRECTORY, { force: true, recursive: true });

  if (wasRunning) {
    await stopCameraStream();
  }
}

/**
 * Drops one kind. The camera is only told to stop once neither the sound nor
 * the picture is wanted, so switching the monitor off does not cut the sound
 * out from under someone listening in another tab.
 */
export async function stopMedia(kind: MediaKind): Promise<void> {
  const relay = getRelay();
  relay.isWanted[kind] = false;

  if (!isAnythingWanted(relay)) {
    await shutDown();
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
    await shutDown();
    throw error;
  } finally {
    relay.starting = null;
  }
}

/**
 * Starts the relay if it is not already running, and marks one kind wanted for
 * another `IDLE_TIMEOUT_MILLISECONDS`. Every playlist and segment request calls
 * this, so a phone that keeps playing keeps the stream alive and one that stops
 * lets it fall away on its own.
 *
 * Idempotent, and safe to call concurrently: overlapping callers await the same
 * in-flight start rather than spawning an ffmpeg each.
 */
export function keepMediaRunning(kind: MediaKind): Promise<void> {
  const relay = getRelay();
  relay.lastRequestedAt[kind] = Date.now();

  if (isAnythingWanted(relay)) {
    relay.isWanted[kind] = true;

    return relay.starting ?? Promise.resolve();
  }

  relay.isWanted[kind] = true;

  relay.idleTimer ??= setInterval(() => {
    const now = Date.now();

    for (const candidate of ['audio', 'video'] as const) {
      if (now - relay.lastRequestedAt[candidate] > IDLE_TIMEOUT_MILLISECONDS) {
        relay.isWanted[candidate] = false;
      }
    }

    if (!isAnythingWanted(relay)) {
      // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget from a timer; a camera that will not answer still leaves the relay stopped locally.
      shutDown().catch(() => {});
    }
  }, IDLE_TIMEOUT_MILLISECONDS);

  relay.starting ??= startRelay();

  return relay.starting;
}

/**
 * Which kind a requested file belongs to, or null for a name ffmpeg never
 * writes. Both the playlists and the segments are named after their kind, so
 * one prefix answers for both — and a name that matches nothing here is what
 * stops a request reaching back out of the directory.
 */
export function getMediaKind(fileName: string): MediaKind | null {
  for (const kind of ['audio', 'video'] as const) {
    if (fileName === PLAYLIST_FILE_NAMES[kind] || new RegExp(`^${kind}\\d+\\.ts$`, 'u').test(fileName)) {
      return kind;
    }
  }

  return null;
}

/**
 * The playlist as it stands, or null until ffmpeg has written one. A phone
 * asking this early is normal: the camera takes a moment to start pushing.
 */
export function readPlaylist(kind: MediaKind): null | string {
  const path = join(OUTPUT_DIRECTORY, PLAYLIST_FILE_NAMES[kind]);

  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * One segment by name. The name is checked against the pattern ffmpeg writes
 * rather than trusted, so a request cannot reach back out of the directory.
 */
export function readSegment(fileName: string): Buffer | null {
  if (getMediaKind(fileName) === null) {
    return null;
  }

  const path = join(OUTPUT_DIRECTORY, fileName);

  return existsSync(path) ? readFileSync(path) : null;
}
