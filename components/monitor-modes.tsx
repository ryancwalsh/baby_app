'use client';

import { useEffect } from 'react';

import { CameraFeed } from '@/components/camera-feed';
import { NanitTemperature } from '@/components/nanit-temperature';
import { consumeNavigationTap, MONITOR_HREF } from '@/components/navigation-tap';
import { Webcam } from '@/components/webcam';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useWorkerStatus } from '@/hooks/use-worker-status';

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
  const isOffline = useWorkerStatus() === 'offline';

  /**
   * A tap on the tab is a request for the Nanit's picture, and `CameraFeed`
   * consumes it when it is showing — its effect runs before this one. In
   * webcam mode nothing does, so it is thrown away here. Left in place, it
   * would start the Nanit the next time someone switched back to it.
   *
   * The same goes for a tap while the laptop is offline: `CameraFeed` is not
   * showing, so the tap is thrown away here rather than remembered and
   * replayed when the laptop comes back, which would start the camera minutes
   * later, unasked.
   */
  useEffect(() => {
    consumeNavigationTap(MONITOR_HREF);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <NanitTemperature secretHash={secretHash} />

        <div className="border-foreground/15 flex flex-1 rounded-2xl border p-1" role="radiogroup">
          {[
            { isSelected: !isWebcam, label: 'Nanit', value: null },
            { isSelected: isWebcam, label: 'Webcam', value: WEBCAM_MODE },
          ].map((option) => (
            <button
              aria-checked={option.isSelected}
              className={`flex-1 rounded-xl py-2 text-sm ${option.isSelected ? 'bg-foreground/10 text-accent' : 'text-faint'}`}
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
      </div>

      {isWebcam && <Webcam secretHash={secretHash} />}
      {!isWebcam && isOffline && (
        <div className="border-foreground/10 flex flex-col items-start gap-3 rounded-2xl border px-5 py-4 text-sm">
          <p className="text-muted">The laptop is offline, so the Nanit cannot be watched or heard. Webcam mode works without it.</p>
          <button
            className="border-foreground/15 rounded-lg border px-4 py-2 font-semibold text-accent"
            onClick={() => {
              store(WEBCAM_MODE);
            }}
            type="button"
          >
            Switch to Webcam
          </button>
        </div>
      )}
      {!isWebcam && !isOffline && <CameraFeed secretHash={secretHash} />}
    </div>
  );
}
