'use client';

import { useCallback, useEffect, useState } from 'react';

import { getTrackingLogAction, type TrackingLog } from '@/app/actions/tracking';

/**
 * The whole log, loaded again whenever the page comes back into view, so a phone that was put down shows what the other one logged meanwhile.
 */
export function useTrackingLog(secretHash: string) {
  const [log, setLog] = useState<null | TrackingLog>(null);
  const [error, setError] = useState<null | string>(null);

  const load = useCallback(async () => {
    try {
      setLog(await getTrackingLogAction(secretHash));
      setError(null);
    } catch {
      setError('Could not load the tracking log.');
    }
  }, [secretHash]);

  useEffect(() => {
    load();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        load();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  return { error, log };
}
