'use client';

import { EyeIcon, WebcamIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getWebcamCameraStateAction } from '@/app/actions/webcam';
import { unlockAlarm } from '@/components/webcam-alarm';
import { WebcamCamera } from '@/components/webcam-camera';
import { WebcamWatch } from '@/components/webcam-watch';

/**
 * Two phones instead of the Nanit: one near the baby as the camera, one
 * watching it. For nights away from the nursery.
 *
 * Neither role is remembered. The bottom navigation restores this tab on
 * launch, and a phone that came back as the camera on its own would be filming
 * without anyone having asked it to.
 */

type Role = 'camera' | 'watcher';

function formatTime(milliseconds: number) {
  return new Date(milliseconds).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function Webcam({ secretHash }: { readonly secretHash: string }) {
  const [role, setRole] = useState<null | Role>(null);
  /**
   * When the running camera started, null when there is none, and undefined
   * until the server has said.
   */
  const [cameraStartedAt, setCameraStartedAt] = useState<null | number | undefined>(undefined);
  const [isConfirmingReplace, setIsConfirmingReplace] = useState(false);

  /**
   * Asked once each time the choice is shown, so a camera started on the other
   * phone in the meantime is offered for replacement rather than silently
   * taken over.
   */
  useEffect(() => {
    let isCurrent = true;

    const read = async () => {
      try {
        const state = await getWebcamCameraStateAction(secretHash);

        if (isCurrent) {
          setCameraStartedAt(state.startedAt);
        }
      } catch {
        if (isCurrent) {
          setCameraStartedAt(null);
        }
      }
    };

    if (role === null) {
      read();
    }

    return () => {
      isCurrent = false;
    };
  }, [role, secretHash]);

  function exit() {
    setIsConfirmingReplace(false);
    setRole(null);
  }

  if (role === 'camera') {
    return <WebcamCamera onExit={exit} secretHash={secretHash} />;
  }

  if (role === 'watcher') {
    return <WebcamWatch onExit={exit} secretHash={secretHash} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {isConfirmingReplace && cameraStartedAt !== null && cameraStartedAt !== undefined ? (
        <div className="border-foreground/15 flex flex-col gap-3 rounded-2xl border px-5 py-4">
          <p className="opacity-70">Another phone has been the camera since {formatTime(cameraStartedAt)}. Make this phone the camera instead? The other one will stop.</p>
          <div className="flex gap-2">
            <button
              className="border-foreground/15 flex-1 rounded-xl border py-3 text-sm opacity-70"
              onClick={() => {
                setIsConfirmingReplace(false);
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="flex-1 rounded-xl border border-amber-500/40 py-3 text-sm text-amber-500"
              onClick={() => {
                setRole('camera');
              }}
              type="button"
            >
              Replace it
            </button>
          </div>
        </div>
      ) : (
        <button
          className="border-foreground/15 bg-foreground/2 flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left"
          onClick={() => {
            if (cameraStartedAt === null) {
              setRole('camera');
            } else {
              setIsConfirmingReplace(true);
            }
          }}
          type="button"
        >
          <WebcamIcon aria-hidden className="size-6 opacity-50" />
          <span className="flex-1">
            <span className="block opacity-80">Camera</span>
            <span className="block text-sm opacity-60">Put this phone near the baby.</span>
          </span>
        </button>
      )}

      <button
        className="border-foreground/15 bg-foreground/2 flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left"
        onClick={() => {
          /**
           * Here, inside the tap, because iOS only lets the alarm make a sound
           * later if its audio was started by one.
           */
          unlockAlarm();
          setRole('watcher');
        }}
        type="button"
      >
        <EyeIcon aria-hidden className="size-6 opacity-50" />
        <span className="flex-1">
          <span className="block opacity-80">Watch</span>
          <span className="block text-sm opacity-60">See and hear the camera phone.</span>
        </span>
      </button>

      <p className="text-foreground/40 text-sm">
        {cameraStartedAt === undefined ? '' : cameraStartedAt === null ? 'No camera is running.' : `A camera has been running since ${formatTime(cameraStartedAt)}.`}
      </p>
    </div>
  );
}
