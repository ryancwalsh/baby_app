import { type NextRequest } from 'next/server';

import { attemptLogin } from '@/auth/login';
import { connect, getNightLightState, type NightLightState, subscribeToNightLight } from '@/services/nanit/connection';

/**
 * Holding a stream open needs the Node runtime, not the edge one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Comment frames keep proxies from closing an idle stream.
 */
const HEARTBEAT_MILLISECONDS = 25_000;

/**
 * Pushes night light state to the browser as it changes.
 *
 * The server already learns about changes the moment the camera announces
 * them, including ones made from the Nanit app — what was missing was any way
 * to tell the page, so it only caught up on a refresh. One EventSource per
 * open page closes that gap without polling.
 *
 * `EventSource` cannot send headers, so the login hash arrives as a query
 * parameter. That is the same credential the server actions take, checked the
 * same way — including the rate limit, since a stream is another way to try a
 * hash.
 */
export async function GET(request: NextRequest) {
  const secretHash = request.nextUrl.searchParams.get('secretHash') ?? '';
  const attempt = await attemptLogin(secretHash);

  if (!attempt.isLoggedIn) {
    return new Response('Not logged in.', { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    cancel() {
      /**
       * Set by `start`; both run for the life of one request.
       */
    },
    start(controller) {
      const send = (state: NightLightState) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
      };

      /**
       * The current state first, so a fresh page is right immediately.
       */
      send(getNightLightState());
      /**
       * Opened but not awaited: a camera that will not answer should not hold
       * up or close the stream, and the first frame has already been sent.
       */
      // eslint-disable-next-line promise/prefer-await-to-then -- `start` is synchronous; awaiting here would delay every frame behind a connection attempt.
      connect().catch(() => {});

      const unsubscribe = subscribeToNightLight(send);
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, HEARTBEAT_MILLISECONDS);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    },
  });
}
