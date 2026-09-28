import { type NextRequest } from 'next/server';

import { attemptLogin } from '@/auth/login';
import { type WebcamRole, type WebcamServerMessage } from '@/services/webcam/messages';
import { addWatcher, claimCamera } from '@/services/webcam/signaling';

/**
 * Holding a stream open needs the Node runtime, not the edge one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Comment frames keep proxies from closing an idle stream.
 */
const HEARTBEAT_MILLISECONDS = 25_000;

const ROLES = new Set<WebcamRole>(['camera', 'watcher']);

/**
 * One stream per phone in webcam mode, carrying whether a camera is running and
 * the signals other phones address to this one. Replies go back through
 * `sendWebcamSignalAction`.
 *
 * Opening it as the camera is what claims the camera slot, so the page only
 * ever does that after a press. The login hash arrives as a query parameter
 * because `EventSource` cannot send headers, exactly as the night light stream
 * does it.
 */
export async function GET(request: NextRequest) {
  const parameters = request.nextUrl.searchParams;
  const attempt = await attemptLogin(parameters.get('secretHash') ?? '');
  const role = parameters.get('role') as WebcamRole;
  const clientId = parameters.get('clientId') ?? '';

  if (!attempt.isLoggedIn) {
    return new Response('Not logged in.', { status: 401 });
  }

  if (!ROLES.has(role) || clientId === '') {
    return new Response('A role and a client id are needed.', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let isOpen = true;

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, HEARTBEAT_MILLISECONDS);

      const send = (message: WebcamServerMessage) => {
        if (isOpen) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
        }
      };

      /**
       * Called by the hub as well as on abort, since a replaced camera is closed
       * from this end.
       */
      const close = () => {
        if (isOpen) {
          isOpen = false;
          clearInterval(heartbeat);
          controller.close();
        }
      };

      const leave = role === 'camera' ? claimCamera({ close, id: clientId, send }) : addWatcher({ close, id: clientId, send });

      request.signal.addEventListener('abort', () => {
        leave();
        close();
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
