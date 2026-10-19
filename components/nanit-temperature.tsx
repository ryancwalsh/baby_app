'use client';

import { useEffect, useState } from 'react';

import { type TemperatureFrame } from '@/app/api/temperature/stream/route';

/**
 * A reading older than this is not shown. The number is how long a reading can
 * be trusted to describe the room, not how often one arrives — the server asks
 * every 30 seconds, so a reading this old means something has gone wrong.
 */
const FRESH_MILLISECONDS = 15 * 60 * 1_000;
const TICK_MILLISECONDS = 1_000;

function toFahrenheit(celsius: number) {
  return (celsius * 9) / 5 + 32;
}

/**
 * Lucide's thermometer with a slash through it, which Lucide does not have.
 */
function ThermometerOffIcon({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

/**
 * The nursery's temperature from the Nanit, live. A wrong number here is worse
 * than none, because a parent would act on it in the night, so anything that
 * might be stale is crossed out instead of shown: a reading more than
 * FRESH_MILLISECONDS old, a stream that has dropped, or no reading at all.
 *
 * The age is checked every second against the phone's own clock rather than
 * only when a reading arrives, so a feed that goes quiet is caught even though
 * nothing tells the page it has.
 *
 * Opening the stream only reads — see app/api/temperature/stream/route.ts.
 */
export function NanitTemperature({ secretHash }: { readonly secretHash: string }) {
  /**
   * When the reading was taken, by this phone's clock.
   */
  const [reading, setReading] = useState<null | { celsius: number; measuredAt: number }>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const source = new EventSource(`/api/temperature/stream?secretHash=${encodeURIComponent(secretHash)}`);

    source.addEventListener('message', (event) => {
      const frame = JSON.parse(event.data) as TemperatureFrame;
      setReading(frame === null ? null : { celsius: frame.celsius, measuredAt: Date.now() - frame.ageMilliseconds });
      setIsConnected(true);
    });

    /**
     * The browser reconnects by itself, and the first frame after it does sets
     * this back.
     */
    source.addEventListener('error', () => {
      setIsConnected(false);
    });

    return () => {
      source.close();
    };
  }, [secretHash]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, TICK_MILLISECONDS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const freshReading = isConnected && reading !== null && now - reading.measuredAt <= FRESH_MILLISECONDS ? reading : null;

  return (
    <div className="flex shrink-0 items-center text-2xl tabular-nums opacity-70">
      {freshReading === null ? (
        <span aria-label="Nursery temperature unknown" role="img">
          <ThermometerOffIcon className="size-6" />
        </span>
      ) : (
        <span aria-label="Nursery temperature">{Math.round(toFahrenheit(freshReading.celsius))}°F</span>
      )}
    </div>
  );
}
