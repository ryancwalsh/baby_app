'use client';

import { useEffect, useState } from 'react';

import { SECRET_HASH_KEY } from '@/components/login-guard';
import { useLocalStorage } from '@/hooks/use-local-storage';

const SHORT_COMMIT_LENGTH = 7;

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
          <p>Built {version.build_time_UTC} UTC</p>
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
