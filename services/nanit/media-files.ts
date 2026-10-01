import { existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * What the relay in services/nanit/media.ts writes, and reading it back for a
 * phone: the playlists and segments ffmpeg leaves in a temp directory.
 */

export type MediaKind = 'audio' | 'video';

export const OUTPUT_DIRECTORY = join(tmpdir(), 'baby-app-nanit-media');

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
export const SEGMENT_SECONDS = 2;
export const PLAYLIST_SEGMENT_COUNT = 4;
/**
 * How old a playlist file may be and still count as live. ffmpeg rewrites it
 * with every segment, so one that has not changed for the whole span it covers
 * belongs to an ffmpeg that has stopped receiving or has exited.
 *
 * Serving it anyway is the dangerous failure: a phone plays those last few
 * seconds and then holds the final frame, which looks exactly like a sleeping
 * baby. Refusing it makes the phone wait for a fresh one or say it cannot.
 */
const STALE_PLAYLIST_MILLISECONDS = SEGMENT_SECONDS * PLAYLIST_SEGMENT_COUNT * 1_000;
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
 * The playlist as it stands, or null until ffmpeg has written a fresh one. A
 * phone asking this early is normal: the camera takes a moment to start
 * pushing. A playlist that has stopped changing is null too — see
 * `STALE_PLAYLIST_MILLISECONDS`.
 */
export function readPlaylist(kind: MediaKind): null | string {
  const path = join(OUTPUT_DIRECTORY, PLAYLIST_FILE_NAMES[kind]);
  const modifiedAt = statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0;

  return Date.now() - modifiedAt < STALE_PLAYLIST_MILLISECONDS ? readFileSync(path, 'utf8') : null;
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
