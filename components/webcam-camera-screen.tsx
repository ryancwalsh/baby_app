'use client';

import { EyeIcon, SquareIcon, SwitchCameraIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type FacingMode } from '@/components/webcam-checklist';

/**
 * What the camera phone shows while it is the camera: black, with controls
 * that appear on a tap and fade again.
 */

const CONTROLS_VISIBLE_MILLISECONDS = 10_000;
const PREVIEW_MILLISECONDS = 5_000;

export function WebcamCameraScreen({
  error,
  facingMode,
  getStream,
  isWakeLockHeld,
  onFlip,
  onStop,
  watcherCount,
}: {
  readonly error: null | string;
  /**
   * Only so the preview picks up the new camera after a flip.
   */
  readonly facingMode: FacingMode;
  readonly getStream: () => MediaStream | null;
  readonly isWakeLockHeld: boolean;
  readonly onFlip: () => void;
  readonly onStop: () => void;
  readonly watcherCount: number;
}) {
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);

  /**
   * The controls fade after a while so the screen goes back to black.
   */
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;

    if (areControlsVisible) {
      timeout = setTimeout(() => {
        setAreControlsVisible(false);
      }, CONTROLS_VISIBLE_MILLISECONDS);
    }

    return () => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
    };
  }, [areControlsVisible]);

  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    const preview = previewRef.current;

    if (isPreviewing && preview !== null) {
      preview.srcObject = getStream();
      timeout = setTimeout(() => {
        setIsPreviewing(false);
      }, PREVIEW_MILLISECONDS);
    }

    return () => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
    };
  }, [facingMode, getStream, isPreviewing]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      onClick={() => {
        setAreControlsVisible(true);
      }}
    >
      {isPreviewing && <video autoPlay className="mx-auto max-h-[60vh] w-full object-contain" muted playsInline ref={previewRef} />}

      {areControlsVisible && (
        <div className="mt-auto flex flex-col gap-3 text-white/50">
          <p className="text-sm">
            <span className="text-amber-500/70">●</span> Live · {watcherCount === 1 ? '1 phone watching' : `${watcherCount} phones watching`}
          </p>

          {!isWakeLockHeld && (
            <p className="flex gap-2 text-sm text-amber-500/70">
              <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              The screen may lock and stop the camera. Set Auto-Lock to Never in the phone’s display settings.
            </p>
          )}

          {error !== null && <p className="text-sm text-amber-500/70">{error}</p>}

          <div className="flex gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm"
              onClick={() => {
                setIsPreviewing(true);
              }}
              type="button"
            >
              <EyeIcon aria-hidden className="size-4" /> Preview
            </button>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm" onClick={onFlip} type="button">
              <SwitchCameraIcon aria-hidden className="size-4" /> Flip
            </button>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm" onClick={onStop} type="button">
              <SquareIcon aria-hidden className="size-4" /> Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
