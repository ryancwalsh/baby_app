'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps the screen on while `isActive`, and says whether that is working. A lock is released whenever the page is hidden, so it is taken again each time the page comes back.
 */
export function useWakeLock(isActive: boolean): boolean {
  const [isHeld, setIsHeld] = useState(false);

  useEffect(() => {
    let wakeLock: null | WakeLockSentinel = null;
    let isCurrent = true;

    async function hold() {
      if ('wakeLock' in window.navigator && document.visibilityState === 'visible') {
        try {
          const next = await window.navigator.wakeLock.request('screen');

          next.addEventListener('release', () => {
            setIsHeld(false);
          });

          if (isCurrent) {
            wakeLock = next;
            setIsHeld(true);
          } else {
            await next.release();
          }
        } catch {
          setIsHeld(false);
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        hold();
      }
    }

    if (isActive) {
      hold();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isCurrent = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (wakeLock !== null) {
        // eslint-disable-next-line promise/prefer-await-to-then -- Cleanup is synchronous; the release finishes on its own.
        wakeLock.release().catch(() => {});
      }
    };
  }, [isActive]);

  return isHeld;
}
