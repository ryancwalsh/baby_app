'use client';

import { useEffect } from 'react';

import { CameraFeed } from '@/components/camera-feed';
import { consumeNavigationTap, MONITOR_HREF } from '@/components/navigation-tap';
import { Webcam } from '@/components/webcam';
import { useLocalStorage } from '@/hooks/use-local-storage';

const MONITOR_MODE_KEY = 'baby-app-monitor-mode';
const WEBCAM_MODE = 'webcam';

/**
 * The Nanit, or two phones standing in for it. Remembered per phone, since a
 * phone that travels tends to keep being the one that travels.
 *
 * Switching to Nanit shows its switch off. Only a tap on the Monitor tab or on
 * the switch itself starts the camera, never a change of mode.
 */
export function MonitorModes({ secretHash }: { readonly secretHash: string }) {
  const { store, value: mode } = useLocalStorage(MONITOR_MODE_KEY);
  const isWebcam = mode === WEBCAM_MODE;

  /**
   * A tap on the tab is a request for the Nanit's picture, and `CameraFeed`
   * consumes it when it is showing — its effect runs before this one. In
   * webcam mode nothing does, so it is thrown away here. Left in place, it
   * would start the Nanit the next time someone switched back to it.
   */
  useEffect(() => {
    consumeNavigationTap(MONITOR_HREF);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="border-foreground/15 flex rounded-2xl border p-1" role="radiogroup">
        {[
          { isSelected: !isWebcam, label: 'Nanit', value: null },
          { isSelected: isWebcam, label: 'Webcam', value: WEBCAM_MODE },
        ].map((option) => (
          <button
            aria-checked={option.isSelected}
            className={`flex-1 rounded-xl py-2 text-sm ${option.isSelected ? 'bg-foreground/10 text-amber-500' : 'opacity-50'}`}
            key={option.label}
            onClick={() => {
              store(option.value);
            }}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {isWebcam ? <Webcam secretHash={secretHash} /> : <CameraFeed secretHash={secretHash} />}
    </div>
  );
}
