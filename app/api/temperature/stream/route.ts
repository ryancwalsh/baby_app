import { type NextRequest } from 'next/server';

import { attemptLogin } from '@/auth/login';
import { type TemperatureReading } from '@/services/nanit/camera';
import { connect, getTemperature, subscribeToTemperature } from '@/services/nanit/connection';

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
 * How old the reading is, rather than when it was taken, so the phone can date
 * it by its own clock. A phone whose clock disagrees with this machine's would
 * otherwise see a fresh reading as stale, or worse, a stale one as fresh.
 *
 * Null until the camera has given a reading since this process started.
 */
export type TemperatureFrame = null | { ageMilliseconds: number; celsius: number };

function toFrame(reading: null | TemperatureReading): TemperatureFrame {
  return reading === null ? null : { ageMilliseconds: Math.max(0, Date.now() - reading.measuredAt), celsius: reading.celsius };
}

/**
 * Pushes the room's temperature to the browser with every reading, the same
 * way the night light stream pushes its state, and with the same login check.
 * Only ever reads: the camera is asked for its sensors and nothing else.
 */
export async function GET(request: NextRequest) {
  const secretHash = request.nextUrl.searchParams.get('secretHash') ?? '';
  const attempt = await attemptLogin(secretHash);

  if (!attempt.isLoggedIn) {
    return new Response('Not logged in.', { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (reading: null | TemperatureReading) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(toFrame(reading))}\n\n`));
      };

      /**
       * The last reading first, so a fresh page has something immediately.
       * The phone decides from its age whether it can be shown.
       */
      send(getTemperature());
      /**
       * Opened but not awaited, for the same reason as the night light stream.
       */
      // eslint-disable-next-line promise/prefer-await-to-then -- `start` is synchronous; awaiting here would delay every frame behind a connection attempt.
      connect().catch(() => {});

      const unsubscribe = subscribeToTemperature(send);
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
