'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';

import { sendWebcamSignalAction } from '@/app/actions/webcam';
import { getIsAlarmAudible, soundAlarm } from '@/components/webcam-alarm';
import { describeConnection, getLocalDescription, ICE_SERVERS, openWebcamStream, readReceivedCounts, waitForIceGathering } from '@/components/webcam-connection';
import { type Lost, type Status } from '@/components/webcam-watch-picture';
import { CAMERA_ADDRESS, type WebcamServerMessage } from '@/services/webcam/messages';

const WATCHDOG_MILLISECONDS = 1_000;
/**
 * How long the picture or sound may stand still before it counts as lost. The
 * camera sends 15 frames a second, so this is far past any ordinary hiccup.
 */
const STALE_AFTER_MILLISECONDS = 5_000;
const ALARM_REPEAT_MILLISECONDS = 2_000;
/**
 * How often to ask the camera for a fresh offer while nothing is arriving and
 * no attempt is under way. This is the whole of the recovery: a phone that
 * changed networks, or a camera that restarted, answers with a new connection.
 */
const RETRY_MILLISECONDS = 10_000;
/**
 * How long one attempt gets before being given up on. A new offer closes the
 * attempt in progress on both phones, and gathering, signaling, and checks can
 * take a slow phone well past the retry interval, so it must not cut them short.
 */
const CONNECT_LIMIT_MILLISECONDS = 30_000;

/**
 * The watching phone's connection to the camera, and the watchdog over it.
 */
export function useWebcamWatch({
  isAlarmOn,
  onStream,
  secretHash,
  videoRef,
}: {
  readonly isAlarmOn: boolean;
  /**
   * A stream has just been attached to the video, and wants playing.
   */
  readonly onStream: () => void;
  readonly secretHash: string;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [status, setStatus] = useState<Status>('waiting');
  const [lost, setLost] = useState<Lost>(null);
  const [isAlarmAudible, setIsAlarmAudible] = useState(true);
  const [diagnostics, setDiagnostics] = useState('');
  const [unmonitoredMilliseconds, setUnmonitoredMilliseconds] = useState<null | number>(null);
  /**
   * Read by the watchdog's interval, which is set up once and would otherwise
   * only ever see the first render's values.
   */
  const isAlarmOnRef = useRef(isAlarmOn);
  const onStreamRef = useRef(onStream);
  const statusRef = useRef<Status>('waiting');
  /**
   * For asking again from outside the effect.
   */
  const askForOfferRef = useRef<() => void>(() => {});

  useEffect(() => {
    isAlarmOnRef.current = isAlarmOn;
    onStreamRef.current = onStream;
  });

  useEffect(() => {
    const clientId = window.crypto.randomUUID();
    let connection: null | RTCPeerConnection = null;
    let cameraId: null | string = null;
    let isCameraRunning = false;
    let hasEverBeenLive = false;
    let attemptStartedAt = 0;
    let received = { audioPackets: 0, codec: '', frames: 0 };
    let lastFrameAt = Date.now();
    let lastAudioAt = Date.now();
    let lastRetryAt = Date.now();
    let lastAlarmAt = 0;
    let lastCheckAt = Date.now();

    function setWatchStatus(next: Status) {
      statusRef.current = next;
      setStatus(next);
    }

    function hangUp() {
      connection?.close();
      connection = null;

      if (videoRef.current !== null) {
        videoRef.current.srcObject = null;
      }
    }

    function askForOffer() {
      lastRetryAt = Date.now();
      // eslint-disable-next-line promise/prefer-await-to-then -- Fire and forget: the watchdog asks again if this is lost.
      sendWebcamSignalAction(secretHash, { from: clientId, to: CAMERA_ADDRESS, type: 'hello' }).catch(() => {});
    }

    askForOfferRef.current = askForOffer;

    async function answer(from: string, offerId: string | undefined, description: RTCSessionDescriptionInit) {
      hangUp();

      const next = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      connection = next;
      cameraId = from;
      attemptStartedAt = Date.now();
      received = { audioPackets: 0, codec: '', frames: 0 };

      /**
       * Having failed, it goes on saying so while it tries, rather than flicker back to connecting every few seconds.
       */
      if (statusRef.current !== 'failed') {
        setWatchStatus('connecting');
      }

      next.addEventListener('track', (event) => {
        const [stream] = event.streams;

        if (videoRef.current !== null && stream !== undefined && videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
          onStreamRef.current();
        }
      });

      next.addEventListener('connectionstatechange', () => {
        /**
         * Never connected at all, which with no relay server usually means a
         * network that keeps its devices apart. Being connected does not make
         * it live: that takes frames, which the watchdog looks for.
         */
        if (connection === next && next.connectionState === 'failed' && !hasEverBeenLive) {
          setWatchStatus('failed');
        }
      });

      try {
        await next.setRemoteDescription(description);
        await next.setLocalDescription();
        await waitForIceGathering(next);

        if (connection === next) {
          await sendWebcamSignalAction(secretHash, { description: getLocalDescription(next), from: clientId, offerId, to: from, type: 'answer' });
        }
      } catch {
        /**
         * The watchdog asks for a fresh offer.
         */
      }
    }

    function handleMessage(message: WebcamServerMessage) {
      if (message.type === 'camera') {
        isCameraRunning = message.startedAt !== null;

        if (!isCameraRunning && connection === null && statusRef.current !== 'stopped') {
          setWatchStatus('waiting');
        }
      } else if (message.type === 'signal') {
        const { description, from, offerId, type } = message.signal;

        if (type === 'offer' && description !== undefined) {
          answer(from, offerId, description);
        } else if (type === 'bye' && from === cameraId) {
          /**
           * Stopped on purpose, which is not an emergency.
           */
          hangUp();
          hasEverBeenLive = false;
          setWatchStatus('stopped');
        }
      }
    }

    const source = openWebcamStream(secretHash, 'watcher', clientId, handleMessage);

    /**
     * Counts what has arrived on the current connection, so neither a retry nor a new connection can look like progress: only a counter rising does.
     */
    async function countReceived(now: number) {
      const current = connection;

      if (current !== null) {
        const latest = await readReceivedCounts(current);

        if (connection === current) {
          if (latest.frames > received.frames) {
            lastFrameAt = now;

            if (statusRef.current !== 'live') {
              /**
               * Sound starts at about the same moment as the picture, on this connection, so its time starts over too.
               */
              lastAudioAt = now;
              hasEverBeenLive = true;
              setWatchStatus('live');
            }
          }

          if (latest.audioPackets > received.audioPackets) {
            lastAudioAt = now;
          }

          received = latest;
        }
      }
    }

    function isAttemptOver(now: number) {
      return (
        connection === null ||
        connection.connectionState === 'closed' ||
        connection.connectionState === 'disconnected' ||
        connection.connectionState === 'failed' ||
        now - attemptStartedAt >= CONNECT_LIMIT_MILLISECONDS
      );
    }

    /**
     * Frames moving is the only evidence worth trusting. Connection states lag,
     * `currentTime` is a clock that runs regardless, and a camera phone that has
     * locked its screen can stay "connected" while sending nothing at all.
     */
    async function check() {
      const now = Date.now();
      const sinceLastCheck = now - lastCheckAt;

      lastCheckAt = now;

      /**
       * The only sign of a page that was frozen, which a locked iPhone does: the clock has jumped, and nothing could have been noticed or sounded meanwhile.
       */
      if (hasEverBeenLive && sinceLastCheck > STALE_AFTER_MILLISECONDS) {
        setUnmonitoredMilliseconds(sinceLastCheck);
      }

      await countReceived(now);

      const isWatching = hasEverBeenLive && statusRef.current !== 'stopped';
      const isPictureLost = now - lastFrameAt > STALE_AFTER_MILLISECONDS;
      const isSoundLost = now - lastAudioAt > STALE_AFTER_MILLISECONDS;
      const nextLost: Lost = isWatching && isPictureLost ? 'picture' : isWatching && isSoundLost ? 'sound' : null;

      setLost(nextLost);
      setIsAlarmAudible(getIsAlarmAudible());
      setDiagnostics(describeConnection(connection, received));

      if (nextLost !== null && isAlarmOnRef.current && now - lastAlarmAt > ALARM_REPEAT_MILLISECONDS) {
        lastAlarmAt = now;
        soundAlarm();
      }

      if (!hasEverBeenLive && connection !== null && now - attemptStartedAt >= CONNECT_LIMIT_MILLISECONDS) {
        setWatchStatus('failed');
      }

      if (isCameraRunning && isPictureLost && now - lastRetryAt > RETRY_MILLISECONDS && isAttemptOver(now)) {
        askForOffer();
      }
    }

    const watchdog = setInterval(() => {
      check();
    }, WATCHDOG_MILLISECONDS);

    return () => {
      clearInterval(watchdog);
      source.close();

      if (connection !== null && cameraId !== null) {
        // eslint-disable-next-line promise/prefer-await-to-then -- Cleanup is synchronous; the camera notices on its own if this is lost.
        sendWebcamSignalAction(secretHash, { from: clientId, to: cameraId, type: 'bye' }).catch(() => {});
      }

      hangUp();
    };
  }, [secretHash, videoRef]);

  return {
    askForOffer: () => {
      askForOfferRef.current();
    },
    diagnostics,
    dismissUnmonitored: () => {
      setUnmonitoredMilliseconds(null);
    },
    isAlarmAudible,
    lost,
    status,
    unmonitoredMilliseconds,
  };
}
