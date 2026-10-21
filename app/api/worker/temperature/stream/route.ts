import { type NextRequest } from 'next/server';

import { GET as getStream } from '@/app/api/temperature/stream/route';
import { withCors } from '@/services/worker/http';

/**
 * Holding a stream open needs the Node runtime, not the edge one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The same stream as `/api/temperature/stream`, open to the cloud's pages too.
 */
export async function GET(request: NextRequest) {
  return withCors(request, await getStream(request));
}
