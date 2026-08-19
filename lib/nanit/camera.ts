import protobuf from 'protobufjs';
import WebSocket from 'ws';

import { HttpStatusCode } from '@/lib/http-status-code';
import { NANIT_API_HOST } from '@/lib/nanit/auth';
import { NANIT_PROTO } from '@/lib/nanit/protocol';

const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
/**
 * Cameras drop a silent socket, so give them traffic well inside that.
 */
const KEEPALIVE_INTERVAL_MILLISECONDS = 30_000;

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (response: Record<string, unknown>) => void;
  timer: NodeJS.Timeout;
};

/**
 * The decoded shapes this app reads. Everything else in a frame is ignored.
 */
type Frame = {
  request?: { control?: { nightLight?: string } };
  response?: {
    control?: { nightLight?: string };
    requestId: number;
    requestType?: string;
    settings?: { nightLightBrightness?: number };
    statusCode?: number;
    statusMessage?: string;
  };
};

export type CameraHandlers = {
  onBrightness: (brightness: number) => void;
  onClose: () => void;
  /**
   * Fired for every on/off the camera announces, including app-driven ones.
   */
  onNightLight: (isOn: boolean) => void;
};

export type CameraConnection = {
  close: () => void;
  sendRequest: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

/**
 * Resolves as soon as the socket is open. It deliberately does not wait around
 * for the camera's opening announcements: this connection is meant to be held
 * open, so anything announced later still arrives through `onNightLight`.
 */
export async function connectToCamera(cameraUid: string, accessToken: string, handlers: CameraHandlers): Promise<CameraConnection> {
  const root = protobuf.parse(NANIT_PROTO).root;
  const messageType = root.lookupType('nanit.Message');

  const socket = new WebSocket(
    `wss://${NANIT_API_HOST}/focus/cameras/${cameraUid}/user_connect`,
    /**
     * Unlike the REST API, the websocket wants a "Bearer" prefix.
     */
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const pendingRequests = new Map<number, PendingRequest>();
  let lastRequestId = 0;

  function reportNightLight(nightLight: string | undefined) {
    if (nightLight !== undefined) {
      handlers.onNightLight(nightLight === 'LIGHT_ON');
    }
  }

  socket.on('message', (data: Buffer) => {
    const frame = messageType.toObject(messageType.decode(data), {
      defaults: false,
      enums: String,
    }) as Frame;
    const response = frame.response;

    if (response) {
      const pending = pendingRequests.get(response.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(response.requestId);
        if (response.statusCode === HttpStatusCode.Ok) {
          pending.resolve(response as unknown as Record<string, unknown>);
        } else {
          pending.reject(new Error(`${response.requestType} failed: ${response.statusCode} ${response.statusMessage ?? ''}`));
        }
      }

      /**
       * Responses carry state too, not just the requests the camera pushes.
       */
      reportNightLight(response.control?.nightLight);
      if (response.settings?.nightLightBrightness !== undefined) {
        handlers.onBrightness(response.settings.nightLightBrightness);
      }
    }

    /**
     * The camera announces its own state as REQUESTs whenever something
     * changes, including changes made from the phone app. Holding this socket
     * open is the only way to see them, and the only way to know on/off at all,
     * since GET_CONTROL is never answered.
     */
    reportNightLight(frame.request?.control?.nightLight);
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  const keepaliveTimer = setInterval(() => {
    socket.send(messageType.encode(messageType.fromObject({ type: 'KEEPALIVE' })).finish());
  }, KEEPALIVE_INTERVAL_MILLISECONDS);

  socket.on('close', () => {
    clearInterval(keepaliveTimer);
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('The camera connection closed.'));
    }

    pendingRequests.clear();
    handlers.onClose();
  });

  /**
   * Errors arrive as a close too, so this only needs to stop them throwing.
   */
  socket.on('error', () => {});

  function sendRequest(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      lastRequestId += 1;
      const id = lastRequestId;
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`${type} timed out`));
      }, REQUEST_TIMEOUT_MILLISECONDS);

      pendingRequests.set(id, { reject, resolve, timer });
      socket.send(
        messageType
          .encode(
            messageType.fromObject({
              request: { id, type, ...payload },
              type: 'REQUEST',
            }),
          )
          .finish(),
      );
    });
  }

  return {
    close: () => {
      clearInterval(keepaliveTimer);
      socket.close();
    },
    sendRequest,
  };
}
