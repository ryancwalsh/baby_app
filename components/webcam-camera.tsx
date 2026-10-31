'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { sendWebcamSignalAction } from '@/app/actions/webcam';
import { WebcamCameraScreen } from '@/components/webcam-camera-screen';
import { type FacingMode, WebcamChecklist } from '@/components/webcam-checklist';
import { getLocalDescription, ICE_SERVERS, openWebcamStream, waitForIceGathering } from '@/components/webcam-connection';
import { getCameraConstraints, switchCamera } from '@/components/webcam-media';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { type WebcamServerMessage } from '@/services/webcam/messages';

/**
 * This phone as the camera: a checklist first, then a black screen that sends
 * the picture and the sound to every phone watching.
 *
 * Nothing starts until the Start button is pressed. That press is also what the
 * browser needs before it will ask for the camera and microphone.
 */

type Phase = 'replaced' | 'running' | 'setup';

export function WebcamCamera({ onExit, secretHash }: { readonly onExit: () => void; readonly secretHash: string }) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [error, setError] = useState<null | string>(null);
  const [watcherCount, setWatcherCount] = useState(0);
  const isWakeLockHeld = useWakeLock(phase === 'running');
  const streamRef = useRef<MediaStream | null>(null);
  /**
   * One connection per watching phone, keyed by that phone's id.
   */
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  /**
   * Stable for this component's life, so a stream that blinks reconnects as the
   * same camera rather than a new one replacing itself.
   */
  const clientIdRef = useRef<null | string>(null);

  /**
   * Kept alongside the state so the running effect can read the choice without
   * restarting whenever the camera is flipped.
   */
  const facingModeRef = useRef<FacingMode>('environment');

  function chooseFacingMode(next: FacingMode) {
    facingModeRef.current = next;
    setFacingMode(next);
  }

  function start() {
    setError(null);
    clientIdRef.current ??= window.crypto.randomUUID();
    setPhase('running');
  }

  /**
   * Everything that lives only while the camera is running: the camera and
   * microphone, the signaling stream, and a connection per watcher. The camera is asked for here rather than in the Start handler so
   * that whatever opens it is also what closes it.
   */
  useEffect(() => {
    const peers = peersRef.current;
    const clientId = clientIdRef.current;
    /**
     * The offer each watcher should be answering. An older answer can still be on its way after a newer offer has replaced it, and applying it would make the right answer fail when it arrives.
     */
    const offerIds = new Map<string, string>();
    let isCurrent = true;
    let source: EventSource | null = null;
    let stream: MediaStream | null = null;

    function countWatchers() {
      setWatcherCount([...peers.values()].filter((connection) => connection.connectionState === 'connected').length);
    }

    function hangUp(watcherId: string) {
      peers.get(watcherId)?.close();
      peers.delete(watcherId);
      countWatchers();
    }

    async function offer(watcherId: string) {
      const cameraStream = streamRef.current;
      const existing = peers.get(watcherId);

      /**
       * A watcher still connected needs nothing new. This is how a blink in
       * the signaling stream avoids interrupting a picture that never stopped.
       */
      if (cameraStream !== null && existing?.connectionState !== 'connected') {
        existing?.close();

        const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        const offerId = window.crypto.randomUUID();

        peers.set(watcherId, connection);
        offerIds.set(watcherId, offerId);

        for (const track of cameraStream.getTracks()) {
          connection.addTrack(track, cameraStream);
        }

        connection.addEventListener('connectionstatechange', () => {
          if (peers.get(watcherId) === connection && (connection.connectionState === 'failed' || connection.connectionState === 'closed')) {
            hangUp(watcherId);
          } else {
            countWatchers();
          }
        });

        try {
          await connection.setLocalDescription();
          await waitForIceGathering(connection);

          if (peers.get(watcherId) === connection && clientId !== null) {
            await sendWebcamSignalAction(secretHash, { description: getLocalDescription(connection), from: clientId, offerId, to: watcherId, type: 'offer' });
          }
        } catch {
          /**
           * The watcher asks again when nothing arrives.
           */
          if (peers.get(watcherId) === connection) {
            hangUp(watcherId);
          }
        }
      }
    }

    async function handleMessage(message: WebcamServerMessage) {
      if (message.type === 'replaced') {
        source?.close();
        setPhase('replaced');
      } else if (message.type === 'signal') {
        const { description, from, offerId, type } = message.signal;

        if (type === 'hello') {
          offer(from);
        } else if (type === 'answer' && description !== undefined && offerId === offerIds.get(from)) {
          try {
            await peers.get(from)?.setRemoteDescription(description);
          } catch {
            hangUp(from);
          }
        } else if (type === 'bye') {
          hangUp(from);
        }
      }
    }

    async function run(id: string) {
      try {
        stream = await window.navigator.mediaDevices.getUserMedia(getCameraConstraints(facingModeRef.current));
      } catch {
        if (isCurrent) {
          setError('The camera or microphone was not allowed. Check this browser’s permissions for the site and try again.');
          setPhase('setup');
        }
      }

      if (stream !== null && isCurrent) {
        streamRef.current = stream;
        source = openWebcamStream(secretHash, 'camera', id, (message) => {
          if (isCurrent) {
            handleMessage(message);
          }
        });
      } else if (stream !== null) {
        /**
         * Torn down while the camera was being asked for.
         */
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    }

    if (phase === 'running' && clientId !== null) {
      run(clientId);
    }

    return () => {
      isCurrent = false;
      source?.close();

      /**
       * Told rather than left to notice, so a deliberate stop reads as one on
       * the watching phones instead of setting off their alarm.
       */
      for (const watcherId of peers.keys()) {
        if (clientId !== null) {
          // eslint-disable-next-line promise/prefer-await-to-then -- Cleanup is synchronous; this is a courtesy that may not arrive.
          sendWebcamSignalAction(secretHash, { from: clientId, to: watcherId, type: 'bye' }).catch(() => {});
        }

        peers.get(watcherId)?.close();
      }

      peers.clear();

      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }

      streamRef.current = null;
    };
  }, [phase, secretHash]);

  /**
   * Stable, so the preview does not reattach on every render.
   */
  const getStream = useCallback(() => streamRef.current, []);

  async function flipCamera() {
    const stream = streamRef.current;
    const nextFacingMode = facingMode === 'environment' ? 'user' : 'environment';

    if (stream !== null) {
      setError(null);

      try {
        await switchCamera(stream, [...peersRef.current.values()], nextFacingMode);
        chooseFacingMode(nextFacingMode);
      } catch {
        setError('Could not switch cameras.');
      }
    }
  }

  if (phase === 'replaced') {
    return (
      <div className="flex flex-col gap-3">
        <p className="opacity-70">Another phone/tablet is the camera now, so this one has stopped.</p>
        <button className="border-foreground/15 rounded-2xl border px-5 py-3 opacity-70" onClick={onExit} type="button">
          Back
        </button>
      </div>
    );
  }

  if (phase === 'running') {
    return (
      /**
       * Pure black over everything, the bottom navigation included: this phone
       * is in the baby's room, and on an OLED screen black is as close to off
       * as a web page can get. A tap brings the controls back.
       */
      <WebcamCameraScreen
        error={error}
        facingMode={facingMode}
        getStream={getStream}
        isWakeLockHeld={isWakeLockHeld}
        onFlip={flipCamera}
        onStop={onExit}
        watcherCount={watcherCount}
      />
    );
  }

  return <WebcamChecklist error={error} onBack={onExit} onStart={start} />;
}
