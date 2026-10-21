import { StatusCodes } from 'http-status-codes';
import { type NextRequest } from 'next/server';

import { stopMedia } from '@/services/nanit/media';
import { type MediaKind } from '@/services/nanit/media-files';
import { answerPreflight, isAuthorized, respondWithJson } from '@/services/worker/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEDIA_KINDS: MediaKind[] = ['audio', 'video'];

/**
 * The same as `stopNanitMediaAction`, for pages on the cloud's origin.
 */
export async function POST(request: NextRequest) {
  let response = respondWithJson(request, { error: 'Not logged in.' }, StatusCodes.UNAUTHORIZED);
  if (await isAuthorized(request)) {
    const { kind } = (await request.json()) as { kind: MediaKind };
    if (MEDIA_KINDS.includes(kind)) {
      stopMedia(kind);
      response = respondWithJson(request, { ok: true });
    } else {
      response = respondWithJson(request, { error: 'Unknown media kind.' }, StatusCodes.BAD_REQUEST);
    }
  }

  return response;
}

export function OPTIONS(request: NextRequest) {
  return answerPreflight(request);
}
