'use client';

import { useEffect, useState } from 'react';

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

  if (version === null) {
    return null;
  }

  return (
    <footer className="text-foreground/40 flex flex-col gap-1 text-xs text-center">
      <p>
        Version <span className="font-semibold">{version.commit.slice(0, SHORT_COMMIT_LENGTH)}</span> on {version.branch}
      </p>
      <p>Built {version.build_time_UTC} UTC</p>
    </footer>
  );
}
