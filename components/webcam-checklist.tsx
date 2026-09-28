'use client';

import { CircleAlertIcon, CircleCheckIcon, CircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getIsAndroid, getIsInstalled, getIsIos } from '@/components/platform';

/**
 * What to check before a phone becomes the camera. Some of it the phone can
 * check for itself, and those items say whether they pass; the rest are
 * reminders, and which ones appear depends on the platform.
 */

export type FacingMode = 'environment' | 'user';

type Platform = {
  isAndroid: boolean;
  /**
   * Null when the browser will not say, which is every iPhone.
   */
  isCharging: boolean | null;
  isInstalled: boolean;
  isIos: boolean;
  supportsWakeLock: boolean;
};

type BatteryManager = { charging: boolean };

function ChecklistItem({ children, status }: { readonly children: React.ReactNode; readonly status: 'ok' | 'problem' | 'reminder' }) {
  return (
    <li className="flex gap-3">
      {status === 'ok' && <CircleCheckIcon aria-label="Done" className="mt-0.5 size-4 shrink-0 text-amber-500" />}
      {status === 'problem' && <CircleAlertIcon aria-label="Needs attention" className="mt-0.5 size-4 shrink-0 text-amber-500" />}
      {status === 'reminder' && <CircleIcon aria-hidden className="mt-0.5 size-4 shrink-0 opacity-40" />}
      <span className="text-sm opacity-70">{children}</span>
    </li>
  );
}

export function WebcamChecklist({ error, onBack, onStart }: { readonly error: null | string; readonly onBack: () => void; readonly onStart: () => void }) {
  const [platform, setPlatform] = useState<null | Platform>(null);

  useEffect(() => {
    const batteryNavigator = window.navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    const known = { isAndroid: getIsAndroid(), isCharging: null, isInstalled: getIsInstalled(), isIos: getIsIos(), supportsWakeLock: 'wakeLock' in window.navigator };

    setPlatform(known);

    if (batteryNavigator.getBattery !== undefined) {
      const readBattery = async () => {
        try {
          const battery = await batteryNavigator.getBattery?.();

          if (battery !== undefined) {
            setPlatform({ ...known, isCharging: battery.charging });
          }
        } catch {
          /**
           * Unknown is what it already says.
           */
        }
      };

      readBattery();
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="opacity-70">Before starting this phone/tablet as the camera:</p>

      <ul className="flex flex-col gap-3">
        <ChecklistItem status="reminder">Turn on Do Not Disturb and silence the ringer, so a call or notification cannot wake the baby.</ChecklistItem>
        <ChecklistItem status={platform?.isCharging === true ? 'ok' : platform?.isCharging === false ? 'problem' : 'reminder'}>
          {platform?.isCharging === false ? 'Not charging. Plug the phone/tablet in: this runs all night.' : 'Plug the phone/tablet in: this runs all night.'}
        </ChecklistItem>
        <ChecklistItem status="reminder">
          Keep the phone/tablet and its charging cable out of the baby’s reach, at least 3 feet (1 m) from the crib, as with any monitor cord.
        </ChecklistItem>
        <ChecklistItem status="reminder">
          Stay in this app. Switching apps, locking the phone or taking a call stops the camera, and the watching phone will sound its alert.
        </ChecklistItem>
        <ChecklistItem status="reminder">Most cameras cannot see in the dark. A dim night light in the room makes the picture usable.</ChecklistItem>
        <ChecklistItem status="reminder">Leave the microphone uncovered.</ChecklistItem>

        {platform?.isIos === true && (
          <ChecklistItem status={platform.isInstalled ? 'ok' : 'problem'}>
            {platform.isInstalled
              ? 'Opened from the Home Screen.'
              : 'Add this app to the Home Screen and open it from there. It keeps the screen awake more reliably than a Safari tab.'}
          </ChecklistItem>
        )}

        {platform?.isAndroid === true && <ChecklistItem status="reminder">Use Chrome, and turn off battery saver if the screen will not stay awake.</ChecklistItem>}

        {platform !== null && (
          <ChecklistItem status={platform.supportsWakeLock ? 'ok' : 'problem'}>
            {platform.supportsWakeLock
              ? 'This browser can keep the screen awake.'
              : platform.isIos
                ? 'This browser cannot keep the screen awake. Set Settings › Display & Brightness › Auto-Lock to Never, and switch it back afterwards.'
                : 'This browser cannot keep the screen awake. Set the screen timeout to its longest in the phone/tablet’s display settings.'}
          </ChecklistItem>
        )}
      </ul>

      {error !== null && <p className="text-sm text-amber-500">{error}</p>}

      <div className="flex gap-2">
        <button className="border-foreground/15 rounded-2xl border px-5 py-3 opacity-70" onClick={onBack} type="button">
          Back
        </button>
        <button className="flex-1 rounded-2xl border border-amber-500/40 px-5 py-3 text-amber-500" onClick={onStart} type="button">
          Start camera
        </button>
      </div>
    </div>
  );
}
