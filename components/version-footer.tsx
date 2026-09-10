'use client';

import { useEffect, useState } from 'react';

import { SECRET_HASH_KEY } from '@/components/login-guard';
import { useLocalStorage } from '@/hooks/use-local-storage';

const SHORT_COMMIT_LENGTH = 7;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const RELATIVE_TIME_REFRESH_MILLISECONDS = 30 * MILLISECONDS_PER_SECOND;

function pluralize(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * `build_time_UTC` is written by the postbuild script as `YYYY-MM-DD HH:MM:SS`
 * in UTC, which is not a format the `Date` constructor is required to parse, so
 * it is turned into an ISO string first.
 */
function describeTimeSinceBuild(buildTimeUTC: string, now: number) {
  const buildTime = new Date(`${buildTimeUTC.replace(' ', 'T')}Z`).getTime();
  const seconds = Math.max(0, Math.round((now - buildTime) / MILLISECONDS_PER_SECOND));

  if (seconds < SECONDS_PER_MINUTE) {
    return `${pluralize(seconds, 'sec')} ago`;
  }

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);

  if (minutes < MINUTES_PER_HOUR) {
    return `${pluralize(minutes, 'min')} ago`;
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);

  if (hours < HOURS_PER_DAY) {
    return `${pluralize(hours, 'hour')} ago`;
  }

  return `${pluralize(Math.floor(hours / HOURS_PER_DAY), 'day')} ago`;
}

type Version = {
  branch: string;
  build_time_UTC: string;
  commit: string;
};

/**
 * Fetched at runtime rather than imported, because `public/version.json` is
 * written by the postbuild script — anything baked in at build time would
 * describe the build before this one.
 */
export function VersionFooter() {
  const [version, setVersion] = useState<null | Version>(null);
  const [now, setNow] = useState(() => Date.now());
  const { store, value: secretHash } = useLocalStorage(SECRET_HASH_KEY);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        setVersion((await response.json()) as Version);
      } catch {
        /**
         * A missing version file is not worth a message on a nursery page.
         */
      }
    }

    load();
  }, []);

  /**
   * The phone can sit on this page for a long time, so the relative time is
   * kept honest rather than frozen at whenever the page happened to load.
   */
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MILLISECONDS);

    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="text-foreground/40 flex flex-col gap-1 text-xs text-center">
      <p>
        <a href="https://trello.com/c/4slYijiN/" rel="noopener noreferrer" target="_blank">
          Notes
        </a>{' '}
        |{' '}
        <a href="https://github.com/ryancwalsh/baby_app" rel="noopener noreferrer" target="_blank">
          Source
        </a>
      </p>
      {version !== null && (
        <>
          <p>
            Version <span className="font-semibold">{version.commit.slice(0, SHORT_COMMIT_LENGTH)}</span> on {version.branch}
          </p>
          <p>
            Built {describeTimeSinceBuild(version.build_time_UTC, now)} ({version.build_time_UTC} UTC)
          </p>
        </>
      )}
      {secretHash !== null && secretHash !== undefined && (
        <p className="mt-40">
          <button className="underline" onClick={() => store(null)} type="button">
            Log out
          </button>
        </p>
      )}
    </footer>
  );
}
