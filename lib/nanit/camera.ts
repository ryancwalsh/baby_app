import protobuf from "protobufjs";
import WebSocket from "ws";
import { HttpStatusCode } from "@/lib/http-status-code";
import { NANIT_API_HOST } from "@/lib/nanit/auth";
import { NANIT_PROTO } from "@/lib/nanit/protocol";

const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
/** Cameras drop a silent socket, so give them traffic well inside that. */
const KEEPALIVE_INTERVAL_MILLISECONDS = 30_000;

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
    control?: { nightLight?: string };
  };
}

export interface CameraHandlers {
  /** Fired for every on/off the camera announces, including app-driven ones. */
  onNightLight: (isOn: boolean) => void;
  onBrightness: (brightness: number) => void;
  onClose: () => void;
}

export interface CameraConnection {
  sendRequest: (
    type: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  close: () => void;
}

/**
 * Resolves as soon as the socket is open. It deliberately does not wait around
 * for the camera's opening announcements: this connection is meant to be held
 * open, so anything announced later still arrives through `onNightLight`.
 */
export async function connectToCamera(
  cameraUid: string,
  accessToken: string,
  handlers: CameraHandlers,
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

  function reportNightLight(nightLight: string | undefined) {
    if (nightLight !== undefined) {
      handlers.onNightLight(nightLight === "LIGHT_ON");
    }
  }

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
      /** Responses carry state too, not just the requests the camera pushes. */
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
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  const keepaliveTimer = setInterval(() => {
    socket.send(
      messageType
        .encode(messageType.fromObject({ type: "KEEPALIVE" }))
        .finish(),
    );
  }, KEEPALIVE_INTERVAL_MILLISECONDS);

  socket.on("close", () => {
    clearInterval(keepaliveTimer);
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("The camera connection closed."));
    }
    pendingRequests.clear();
    handlers.onClose();
  });

  /** Errors arrive as a close too, so this only needs to stop them throwing. */
  socket.on("error", () => {});

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
    close: () => {
      clearInterval(keepaliveTimer);
      socket.close();
    },
  };
}
