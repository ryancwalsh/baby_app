import { type NextRequest } from 'next/server';

import { GET as getMedia } from '@/app/api/nanit/media/[file]/route';
import { withCors } from '@/services/worker/http';

/**
 * Serving a live stream needs the Node runtime, not the edge one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The same playlists and segments as `/api/nanit/media`, open to the cloud's pages too. As there, playing the playlist is what starts the camera streaming, so only a press may request it.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ file: string }> }) {
  return withCors(request, await getMedia(request, context));
}
