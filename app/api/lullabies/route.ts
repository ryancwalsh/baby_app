import { type NextRequest } from 'next/server';

import { attemptLogin } from '@/auth/login';
import { saveRecording } from '@/storage/lullabies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Comfortably more than an hour of compressed speech or song. Anything past
 * it is not a lullaby someone sang into a phone.
 */
const MAXIMUM_RECORDING_BYTES = 104_857_600;

/**
 * Takes a new recording as the raw request body. A route rather than a server
 * action, because server actions cap their bodies at a megabyte, which is a
 * few minutes of recording.
 */
export async function POST(request: NextRequest) {
  const attempt = await attemptLogin(request.nextUrl.searchParams.get('secretHash') ?? '');

  if (!attempt.isLoggedIn) {
    return new Response('Not logged in.', { status: 401 });
  }

  const recording = Buffer.from(await request.arrayBuffer());

  if (recording.length === 0) {
    return new Response('The recording was empty.', { status: 400 });
  }

  if (recording.length > MAXIMUM_RECORDING_BYTES) {
    return new Response('The recording is too long to keep.', { status: 413 });
  }

  try {
    return Response.json({ fileName: await saveRecording(recording) });
  } catch (error) {
    console.error('[lullabies] could not save a recording:', error);

    return new Response(error instanceof Error ? error.message : 'Could not save the recording.', { status: 500 });
  }
}
