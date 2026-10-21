import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { type NextRequest } from 'next/server';

import { answerPreflight, respondWithJson } from '@/services/worker/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readCommit(): null | string {
  let commit: null | string = null;
  try {
    commit = (JSON.parse(readFileSync(join(process.cwd(), 'public', 'version.json'), 'utf8')) as { commit?: string }).commit ?? null;
  } catch {
    /**
     * A build that was never stamped has no commit to report, which is not an error.
     */
  }

  return commit;
}

/**
 * Unauthenticated, and says only that the worker is up, which build it runs, and on which machine, so a page can tell whether this phone can reach the worker, and a second worker beside the first shows up.
 */
export function GET(request: NextRequest) {
  return respondWithJson(request, { commit: readCommit(), host: hostname(), ok: true });
}

export function OPTIONS(request: NextRequest) {
  return answerPreflight(request);
}
