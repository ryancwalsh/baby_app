import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { StatusCodes } from 'http-status-codes';
import { type NextRequest } from 'next/server';

import { attemptLogin } from '@/auth/login';
import { getEnvironment } from '@/constants/environment';
import { saveRecording } from '@/storage/lullabies';
import { UPLOADS_PREFIX } from '@/storage/lullaby-uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Converting a long recording takes a while; this is Vercel's ceiling for a function.
 */
export const maxDuration = 300;

/**
 * Comfortably more than an hour of compressed speech or song. Anything past
 * it is not a lullaby someone sang into a phone.
 */
const MAXIMUM_RECORDING_BYTES = 104_857_600;

/**
 * Two requests come here, both with the login hash as a query parameter. The phone first asks for a token to upload a recording straight to Blob, which only a logged-in phone is given; a Vercel function refuses request bodies over 4.5 MB, so the recording cannot come through here. Then, with `?convert=`, it asks for the upload to be turned into a lullaby.
 */
export async function POST(request: NextRequest) {
  const attempt = await attemptLogin(request.nextUrl.searchParams.get('secretHash') ?? '');

  if (!attempt.isLoggedIn) {
    return new Response('Not logged in.', { status: StatusCodes.UNAUTHORIZED });
  }

  const uploadPathname = request.nextUrl.searchParams.get('convert');

  try {
    if (uploadPathname !== null) {
      return Response.json({ fileName: await saveRecording(uploadPathname) });
    }

    return Response.json(
      await handleUpload({
        body: (await request.json()) as HandleUploadBody,

        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(UPLOADS_PREFIX)) {
            throw new Error('Recordings are uploaded under their own prefix.');
          }

          return { addRandomSuffix: true, allowedContentTypes: ['audio/*'], maximumSizeInBytes: MAXIMUM_RECORDING_BYTES };
        },
        request,
        token: getEnvironment().BLOB_READ_WRITE_TOKEN,
      }),
    );
  } catch (error) {
    console.error('[lullabies] could not save a recording:', error);

    return new Response(error instanceof Error ? error.message : 'Could not save the recording.', { status: StatusCodes.INTERNAL_SERVER_ERROR });
  }
}
