import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * The Vercel build's first step: `yarn migrate && yarn build`. Runs the pending migrations after the usual dump, replay, and row-count check, and keeps the dump in the private Blob store as `backups/YYYY-MM-DD_HH-MM-SS_tracking.sql` (UTC), because the build's own filesystem is thrown away. A failed check or a failed upload exits non-zero, which fails the build, so the deployment already serving is left untouched.
 *
 * Does nothing outside a Vercel production build, so a preview build never touches the database, and the laptop keeps migrating lazily as before.
 */

const BLOB_BACKUPS_PREFIX = 'backups/';

async function main() {
  // eslint-disable-next-line n/no-process-env -- Checked before the environment is validated, so that other builds need no secrets to skip.
  const { VERCEL_ENV } = process.env;

  if (VERCEL_ENV === 'production') {
    const { put } = await import('@vercel/blob');
    const { getEnvironment } = await import('@/constants/environment');
    const { migrateDatabase } = await import('@/storage/database');

    const count = await migrateDatabase(async (path) => {
      const blob = await put(`${BLOB_BACKUPS_PREFIX}${basename(path)}`, readFileSync(path), {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/sql',
        token: getEnvironment().BLOB_READ_WRITE_TOKEN,
      });
      console.log(`Uploaded the backup to ${blob.pathname}.`);
    });
    console.log(count > 0 ? `Applied ${count} migration(s).` : 'No migrations pending.');
  } else {
    console.log(`Not a Vercel production build (VERCEL_ENV is ${VERCEL_ENV ?? 'unset'}), so no migrations were run.`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
