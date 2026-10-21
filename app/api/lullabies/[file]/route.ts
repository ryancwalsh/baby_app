import { type NextRequest } from 'next/server';

import { attemptLogin } from '@/auth/login';
import { readLullaby } from '@/storage/lullabies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/u;

/**
 * Serves one lullaby, by ranges. Safari will not play an `<audio>` source that
 * cannot answer a range request, and every browser seeks with them.
 *
 * The login hash arrives as a query parameter because an `<audio>` element
 * cannot send headers, the same way the camera's media route takes it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const attempt = await attemptLogin(request.nextUrl.searchParams.get('secretHash') ?? '');

  if (!attempt.isLoggedIn) {
    return new Response('Not logged in.', { status: 401 });
  }

  const contents = await readLullaby((await params).file);

  if (contents === null) {
    return new Response('No such lullaby.', { status: 404 });
  }

  const size = contents.length;
  const headers = { 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Type': 'audio/mpeg' };
  const range = RANGE_PATTERN.exec(request.headers.get('range') ?? '');

  if (range === null) {
    return new Response(new Uint8Array(contents), { headers: { ...headers, 'Content-Length': String(size) } });
  }

  const [, startText, endText] = range;
  /**
   * `bytes=-500` asks for the last 500 bytes rather than a start of zero.
   */
  const start = startText === '' ? Math.max(0, size - Number(endText)) : Number(startText);
  const end = startText === '' || endText === '' ? size - 1 : Math.min(Number(endText), size - 1);

  if (start > end || start >= size) {
    return new Response(null, { headers: { ...headers, 'Content-Range': `bytes */${size}` }, status: 416 });
  }

  return new Response(new Uint8Array(contents.subarray(start, end + 1)), {
    headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
    status: 206,
  });
}
