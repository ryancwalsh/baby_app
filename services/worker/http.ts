import { StatusCodes } from 'http-status-codes';

import { attemptLogin } from '@/auth/login';
import { getEnvironment } from '@/constants/environment';

/**
 * The worker's routes are called from pages on another origin, the cloud's, which server actions cannot do. Exactly that one origin is allowed, and nothing else is opened up.
 */

const PREFLIGHT_MAXIMUM_AGE_SECONDS = 600;

export function withCors(request: Request, response: Response): Response {
  const { CLOUD_ORIGIN } = getEnvironment();
  const origin = request.headers.get('origin');

  if (CLOUD_ORIGIN !== '' && origin === CLOUD_ORIGIN) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }

  response.headers.append('Vary', 'Origin');

  return response;
}

export function answerPreflight(request: Request): Response {
  return withCors(
    request,
    new Response(null, {
      headers: {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': String(PREFLIGHT_MAXIMUM_AGE_SECONDS),
      },
      status: StatusCodes.NO_CONTENT,
    }),
  );
}

/**
 * `fetch` sends the login hash as a bearer token; it is the same credential the server actions take, checked the same way, including the throttle.
 */
export async function isAuthorized(request: Request): Promise<boolean> {
  const secretHash = request.headers.get('authorization')?.replace(/^Bearer /u, '') ?? '';
  const attempt = await attemptLogin(secretHash);

  return attempt.isLoggedIn;
}

export function respondWithJson(request: Request, body: unknown, status: number = StatusCodes.OK): Response {
  return withCors(request, Response.json(body, { headers: { 'Cache-Control': 'no-store' }, status }));
}
