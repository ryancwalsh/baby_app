'use client';

import { type ReactNode, useEffect, useState } from 'react';

const TICK_MILLISECONDS = 1_000;

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' });

/**
 * The time. Tapping it blacks out the whole screen but for the time itself, for a phone left propped up in the dark, and a tap anywhere brings the page back.
 * Anything passed as children sits at the right of the same row.
 */
export function Clock({ children }: { readonly children?: ReactNode }) {
  /**
   * Read after mount rather than during render, because the server's clock and
   * time zone are not the phone's and the two would disagree.
   */
  const [time, setTime] = useState<null | string>(null);
  const [isBlackedOut, setIsBlackedOut] = useState(false);

  useEffect(() => {
    function tick() {
      setTime(TIME_FORMAT.format(new Date()));
    }

    tick();
    const interval = window.setInterval(tick, TICK_MILLISECONDS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 px-5">
      <button
        aria-label="Black out the screen"
        className="flex-1 text-left text-2xl tabular-nums opacity-70"
        onClick={() => {
          setIsBlackedOut(true);
        }}
        type="button"
      >
        {time}
      </button>

      {children}

      {isBlackedOut && (
        <button
          aria-label="Leave the blacked out screen"
          className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black text-8xl text-white/70 tabular-nums"
          onClick={() => {
            setIsBlackedOut(false);
          }}
          type="button"
        >
          {time}
        </button>
      )}
    </div>
  );
}
