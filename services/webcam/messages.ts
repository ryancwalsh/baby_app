/**
 * What passes between the phones and the server in webcam mode. Nothing here
 * imports from the server, so the browser can share these types.
 *
 * The server only introduces the phones to each other. The picture and the
 * sound go straight from one phone to the other over WebRTC, and never pass
 * through this process.
 */

export type WebcamRole = 'camera' | 'watcher';

/**
 * Whether a phone is serving as the camera right now, and since when.
 */
export type WebcamCameraState = {
  startedAt: null | number;
};

/**
 * Sent between phones, through the server.
 *
 * - `hello`: a watcher asking the camera for an offer. The server also sends
 *   one on a watcher's behalf when it first connects.
 * - `offer` and `answer`: a complete session description each. Candidates are
 *   gathered before sending rather than trickled, which keeps this to one
 *   message each way.
 * - `bye`: a watcher that has stopped, so the camera can let go at once rather
 *   than waiting to notice.
 */
export type WebcamSignal = {
  description?: RTCSessionDescriptionInit;
  from: string;
  /**
   * A phone's id, or `camera` for whichever phone is the camera right now.
   */
  to: string;
  type: 'answer' | 'bye' | 'hello' | 'offer';
};

/**
 * Pushed from the server to a phone over its event stream.
 *
 * `replaced` tells a camera that another phone has taken over, so it must stop
 * rather than reconnect and take the slot back.
 */
export type WebcamServerMessage = (WebcamCameraState & { type: 'camera' }) | { signal: WebcamSignal; type: 'signal' } | { type: 'replaced' };

export const CAMERA_ADDRESS = 'camera';
