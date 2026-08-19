import protobuf from "protobufjs";
import WebSocket from "ws";
import { HttpStatusCode } from "@/lib/http-status-code";
import { NANIT_API_HOST } from "@/lib/nanit/auth";
import { NANIT_PROTO } from "@/lib/nanit/protocol";

const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
/** How long to wait for the state the camera announces just after connecting. */
const ANNOUNCEMENT_WAIT_MILLISECONDS = 3_000;

interface PendingRequest {
  resolve: (response: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** The decoded shapes this app reads. Everything else in a frame is ignored. */
interface Frame {
  request?: { control?: { nightLight?: string } };
  response?: {
    requestId: number;
    requestType?: string;
    statusCode?: number;
    statusMessage?: string;
    settings?: { nightLightBrightness?: number };
  };
}

export interface CameraConnection {
  sendRequest: (
    type: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  /** Whatever on/off state the camera has announced so far, if any. */
  getAnnouncedNightLight: () => string | undefined;
  close: () => void;
}

export async function connectToCamera(
  cameraUid: string,
  accessToken: string,
): Promise<CameraConnection> {
  const root = protobuf.parse(NANIT_PROTO).root;
  const messageType = root.lookupType("nanit.Message");

  const socket = new WebSocket(
    `wss://${NANIT_API_HOST}/focus/cameras/${cameraUid}/user_connect`,
    /** Unlike the REST API, the websocket wants a "Bearer" prefix. */
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const pendingRequests = new Map<number, PendingRequest>();
  let lastRequestId = 0;
  let announcedNightLight: string | undefined;

  socket.on("message", (data: Buffer) => {
    const frame = messageType.toObject(messageType.decode(data), {
      enums: String,
      defaults: false,
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
          pending.reject(
            new Error(
              `${response.requestType} failed: ${response.statusCode} ${response.statusMessage ?? ""}`,
            ),
          );
        }
      }
    }
    /**
     * The camera announces its own state as REQUESTs, both unprompted on
     * connect and whenever something changes. This is the only way to learn
     * whether the light is on, since GET_CONTROL is never answered.
     */
    if (frame.request?.control?.nightLight !== undefined) {
      announcedNightLight = frame.request.control.nightLight;
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  /** Give the camera time to volunteer its opening state dump. */
  await new Promise((resolve) =>
    setTimeout(resolve, ANNOUNCEMENT_WAIT_MILLISECONDS),
  );

  function sendRequest(
    type: string,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      lastRequestId += 1;
      const id = lastRequestId;
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`${type} timed out`));
      }, REQUEST_TIMEOUT_MILLISECONDS);

      pendingRequests.set(id, { resolve, reject, timer });
      socket.send(
        messageType
          .encode(
            messageType.fromObject({
              type: "REQUEST",
              request: { id, type, ...payload },
            }),
          )
          .finish(),
      );
    });
  }

  return {
    sendRequest,
    getAnnouncedNightLight: () => announcedNightLight,
    close: () => socket.close(),
  };
}
