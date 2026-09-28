'use client';

import { Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { type RefObject, useEffect, useState } from 'react';

import { PinchZoomView, VIDEO_ASPECT_RATIO } from '@/components/pinch-zoom-view';

/**
 * The camera phone's picture on the watching phone, turned and pinched the
 * same way as the Nanit's, with what is going on laid over it when there is no
 * picture to show.
 */

export type Status = 'connecting' | 'failed' | 'live' | 'stopped' | 'waiting';

const ROTATION_KEY = 'baby-app-webcam-rotation';
/**
 * How much of the screen the picture's box takes, leaving the controls below
 * it in view.
 */
const PICTURE_SHARE_OF_SCREEN = 0.65;

export function WebcamWatchPicture({ isStale, status, videoRef }: { readonly isStale: boolean; readonly status: Status; readonly videoRef: RefObject<HTMLVideoElement | null> }) {
  const [pictureHeightPixels, setPictureHeightPixels] = useState<null | number>(null);
  const [aspectRatio, setAspectRatio] = useState(VIDEO_ASPECT_RATIO);

  useEffect(() => {
    const measure = () => {
      setPictureHeightPixels(Math.round(window.innerHeight * PICTURE_SHARE_OF_SCREEN));
    };

    measure();
    window.addEventListener('resize', measure);

    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div className="relative -mx-6">
      <PinchZoomView aspectRatio={aspectRatio} maximumHeightPixels={pictureHeightPixels} rotationKey={ROTATION_KEY}>
        <video
          autoPlay
          className="size-full object-contain"
          /**
           * The camera phone can be turned over mid-stream, and the picture's
           * box has to follow the shape it now sends.
           */
          onResize={(event) => {
            const { videoHeight, videoWidth } = event.currentTarget;

            if (videoHeight > 0 && videoWidth > 0) {
              setAspectRatio(videoWidth / videoHeight);
            }
          }}
          playsInline
          ref={videoRef}
        />
      </PinchZoomView>

      {status !== 'live' && !isStale && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          {(status === 'waiting' || status === 'connecting') && <Loader2Icon aria-hidden className="text-foreground/40 size-8 animate-spin" />}
          <p className="text-foreground/50 text-sm">
            {status === 'waiting' && 'Waiting for a camera. Start one on the other phone/tablet.'}
            {status === 'connecting' && 'Connecting to the camera…'}
            {status === 'stopped' && 'The camera was stopped.'}
            {status === 'failed' && 'Could not connect on this network. Try putting both phones/tablets on the same wifi.'}
          </p>
        </div>
      )}

      {/* Deliberately loud for this app: this is the one moment the screen should demand attention. */}
      {isStale && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
          <TriangleAlertIcon aria-hidden className="size-10 text-amber-500" />
          <p className="text-lg font-semibold text-amber-500">No picture: connection lost</p>
          <p className="text-foreground/60 text-sm">Reconnecting…</p>
        </div>
      )}
    </div>
  );
}
