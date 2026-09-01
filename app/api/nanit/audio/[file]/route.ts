import { type NextRequest } from 'next/server';

import { attemptLogin } from '@/auth/login';
import { keepAudioRunning, PLAYLIST_FILE_NAME, readPlaylist, readSegment } from '@/services/nanit/audio';

/**
 * Serving a live stream needs the Node runtime, not the edge one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * How long a phone waits for the first playlist. The camera has to be told to
 * stream and ffmpeg has to cut a segment or two before there is anything to
 * hand over, which takes a few seconds from cold.
 */
const PLAYLIST_WAIT_MILLISECONDS = 15_000;
const PLAYLIST_POLL_MILLISECONDS = 250;

/**
 * An `<audio>` element cannot send headers, so the login hash arrives as a
 * query parameter — the same credential the server actions take, checked the
 * same way, exactly as the night light stream does it.
 *
 * Requesting anything here is also what keeps the relay alive: there is no
 * separate "start" call, so a phone that is playing holds the stream open and
 * one that has stopped lets it shut down on its own.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const secretHash = request.nextUrl.searchParams.get('secretHash') ?? '';
  const attempt = await attemptLogin(secretHash);

  if (!attempt.isLoggedIn) {
    return new Response('Not logged in.', { status: 401 });
  }

  const { file } = await params;
  const noStore = { 'Cache-Control': 'no-store, no-transform' };

  if (file === PLAYLIST_FILE_NAME) {
    try {
      await keepAudioRunning();
    } catch {
      return new Response('Could not reach the camera.', { headers: noStore, status: 502 });
    }

    const deadline = Date.now() + PLAYLIST_WAIT_MILLISECONDS;
    let playlist = readPlaylist();

    while (playlist === null && Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, PLAYLIST_POLL_MILLISECONDS);
      });
      playlist = readPlaylist();
    }

    if (playlist === null) {
      return new Response('The camera has not started streaming.', { headers: noStore, status: 504 });
    }

    /**
     * ffmpeg writes bare segment names, which a player resolves against this
     * URL — dropping the query string, and with it the credential. Stamping the
     * hash onto each segment line is what keeps those requests authorised.
     */
    const authorised = playlist
      .split('\n')
      .map((line) => (line.startsWith('#') || line.trim() === '' ? line : `${line}?secretHash=${encodeURIComponent(secretHash)}`))
      .join('\n');

    return new Response(authorised, {
      headers: { ...noStore, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  }

  const segment = readSegment(file);

  if (segment === null) {
    return new Response('No such segment.', { headers: noStore, status: 404 });
  }

  /**
   * Segments are the heartbeat: a phone playing in the background is still
   * fetching these, which is what tells the relay somebody is listening.
   */
  await keepAudioRunning();

  return new Response(new Uint8Array(segment), {
    headers: { ...noStore, 'Content-Type': 'video/mp2t' },
  });
}
