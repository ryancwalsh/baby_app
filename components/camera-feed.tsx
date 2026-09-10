'use client';

import { VideoIcon, VideoOffIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { stopNanitMediaAction } from '@/app/actions/nanit-media';
import { PinchZoomView } from '@/components/pinch-zoom-view';

/**
 * The live picture from the nursery.
 *
 * It is behind a press rather than shown on arrival, and that is not a
 * preference: asking for the playlist is what tells the camera to start
 * pushing, and a page load must never write to the camera.
 *
 * The picture carries no sound. The room's audio is the listen button, which
 * lives above the router so it keeps playing with the screen off — see
 * components/nanit-audio-provider.tsx.
 */

const PLAYLIST_PATH = '/api/nanit/media/video.m3u8';

/**
 * iOS plays HLS in a `<video>` element itself. Everywhere else — Android
 * Chrome especially — there is no native HLS at all, so hls.js feeds the
 * element through Media Source Extensions instead. It is only fetched where it
 * is needed.
 */
function canPlayHlsNatively(video: HTMLVideoElement): boolean {
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

export function CameraFeed({ secretHash }: { readonly secretHash: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * The hls.js instance, when one is in use. Typed loosely so this module does
   * not have to import hls.js just to name it, which would defeat loading it
   * only on the platforms that need it.
   */
  const hlsRef = useRef<null | { destroy: () => void }>(null);
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

  useEffect(() => {
    let isCurrent = true;

    if (isWatching) {
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
            if (canPlayHlsNatively(video)) {
              video.src = url;
            } else {
              const { default: Hls } = await import('hls.js');

              if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true });
                hls.loadSource(url);
                hls.attachMedia(video);
                hlsRef.current = hls;
              } else {
                throw new Error('This browser cannot play the camera stream.');
              }
            }

            await video.play();
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
   * Turning it off is the one direction that has to reach the server: the relay
   * would otherwise keep the camera streaming until it noticed nobody asking.
   * It only drops the picture — anyone listening keeps their sound.
   */
  useEffect(() => {
    if (!isWatching) {
      detach();

      const stop = async () => {
        try {
          await stopNanitMediaAction(secretHash, 'video');
        } catch {
          /**
           * The picture has already stopped on this phone, which is what the
           * press asked for. A camera left streaming falls away on its own.
           */
        }
      };

      stop();
    }
  }, [detach, isWatching, secretHash]);

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
