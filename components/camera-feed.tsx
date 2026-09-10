'use client';

import { VideoIcon, VideoOffIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { stopNanitMediaAction } from '@/app/actions/nanit-media';
import { attachHlsStream, type HlsPlayer } from '@/components/hls-playback';
import { consumeNavigationTap, MONITOR_HREF } from '@/components/navigation-tap';
import { PinchZoomView } from '@/components/pinch-zoom-view';

/**
 * The live picture from the nursery.
 *
 * Starting it is a press, and that is not a preference: asking for the
 * playlist is what tells the camera to start pushing, and a page load must
 * never write to the camera.
 *
 * Tapping the Monitor tab counts as that press. It is the same thing a person
 * does with the same finger for the same reason, so making them press twice
 * buys nothing. What it is not is *arriving* on the page: the bottom nav
 * restores the last tab on launch, so a phone left here overnight would
 * otherwise wake the camera on its own. Only a tap is recorded — see
 * components/navigation-tap.ts.
 *
 * The picture carries no sound. The room's audio is the listen button, which
 * lives above the router so it keeps playing with the screen off — see
 * components/nanit-audio-provider.tsx.
 */

const PLAYLIST_PATH = '/api/nanit/media/video.m3u8';

export function CameraFeed({ secretHash }: { readonly secretHash: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * The hls.js instance, when one is in use — null when the browser is playing
   * the stream itself and there is nothing to tear down.
   */
  const hlsRef = useRef<HlsPlayer | null>(null);
  /**
   * Whether the picture has ever been on in this component's life. Without it
   * the "switched off" effect below fires on the very first render — before a
   * tab tap has had a chance to switch it on — and every arrival would tell
   * the server to stop just ahead of asking it to start.
   */
  const hasEverWatchedRef = useRef(false);
  const [isWatching, setIsWatching] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<null | string>(null);

  const detach = useCallback(() => {
    const video = videoRef.current;

    if (hlsRef.current !== null) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (video !== null) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, []);

  /**
   * Told to the server rather than only done here, because the relay would
   * otherwise keep the camera streaming until it noticed nobody asking. It
   * drops the picture alone — anyone listening keeps their sound.
   */
  const stopWatchingOnServer = useCallback(async () => {
    try {
      await stopNanitMediaAction(secretHash, 'video');
    } catch {
      /**
       * The picture has already stopped on this phone, which is what was
       * asked for. A camera left streaming falls away on its own.
       */
    }
  }, [secretHash]);

  /**
   * Runs once, before the effects below: a tap on the tab is a request for the
   * picture, and consuming it here means one tap can only start it once.
   */
  useEffect(() => {
    if (consumeNavigationTap(MONITOR_HREF)) {
      setIsWatching(true);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    if (isWatching) {
      hasEverWatchedRef.current = true;

      const url = `${PLAYLIST_PATH}?secretHash=${encodeURIComponent(secretHash)}`;

      setIsStarting(true);
      setError(null);

      /**
       * The first playlist can take a few seconds: the camera has to be told to
       * stream before there is anything to hand over.
       */
      const start = async () => {
        try {
          const video = videoRef.current;

          if (video !== null) {
            hlsRef.current = await attachHlsStream(video, url);

            try {
              await video.play();
            } catch {
              /**
               * Not fatal, and deliberately not reported as a camera problem.
               * The stream is attached and buffering by this point; what
               * fails here is the browser's own playback policy — Chrome
               * pauses muted, video-only media whenever the page is in the
               * background, and answers with an `AbortError`. Tearing the
               * feed down over that would replace a picture that is about to
               * appear with "could not reach the camera", which is simply
               * untrue. Coming back to the page, or tapping the picture,
               * starts it.
               */
            }
          }

          if (isCurrent) {
            setIsStarting(false);
          }
        } catch {
          if (isCurrent) {
            setIsStarting(false);
            setError('Could not reach the camera.');
            setIsWatching(false);
          }
        }
      };

      start();
    }

    return () => {
      isCurrent = false;
    };
  }, [isWatching, secretHash]);

  /**
   * Turning it off is the one direction that has to reach the server.
   */
  useEffect(() => {
    if (!isWatching && hasEverWatchedRef.current) {
      detach();
      stopWatchingOnServer();
    }
  }, [detach, isWatching, stopWatchingOnServer]);

  /**
   * Leaving the tab drops the picture too. Without this the camera would keep
   * pushing until the relay's idle timeout noticed, which is half a minute of
   * the nursery going to the cloud for a page nobody is looking at — and with
   * the tab itself starting the stream, leaving it is now the ordinary way out.
   */
  useEffect(() => {
    return () => {
      if (hasEverWatchedRef.current) {
        stopWatchingOnServer();
      }
    };
  }, [stopWatchingOnServer]);

  return (
    <div className="flex flex-col gap-3">
      {isWatching ? (
        <PinchZoomView>
          {/* A live camera has nothing to caption. */}
          <video className="size-full object-contain" muted playsInline ref={videoRef} />
        </PinchZoomView>
      ) : (
        <div className="border-foreground/10 flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
          <VideoIcon aria-hidden className="text-foreground/30 size-8" />
          <p className="text-foreground/40 text-sm">The camera is not streaming</p>
        </div>
      )}

      {error !== null && <p className="text-sm text-amber-500">{error}</p>}

      <button
        className="border-foreground/10 flex items-center justify-center gap-2 rounded-lg border py-3 text-sm"
        onClick={() => {
          setIsWatching(!isWatching);
        }}
        type="button"
      >
        {isWatching ? <VideoOffIcon className="size-4 text-amber-500" /> : <VideoIcon className="text-foreground/50 size-4" />}
        <span className={isWatching ? 'text-amber-500' : 'text-foreground/70'}>{isStarting ? 'Starting the camera…' : isWatching ? 'Stop watching' : 'Watch the room'}</span>
      </button>
    </div>
  );
}
