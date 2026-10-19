'use client';

import { useEffect, useState } from 'react';

import { MILLISECONDS_PER_SECOND } from '@/constants/time';

/**
 * The current time, ticking once a second, for the counters that are always running. Null until mounted, because the server's clock is not the phone's.
 */
export function useNow(): null | number {
  const [now, setNow] = useState<null | number>(null);

  useEffect(() => {
    function tick() {
      setNow(Date.now());
    }

    tick();
    const interval = window.setInterval(tick, MILLISECONDS_PER_SECOND);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return now;
}
