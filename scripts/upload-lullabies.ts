import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listLullabyFiles, storeLullaby } from '@/storage/lullabies';

/**
 * One-off: copies the mp3s in the old `lullabies/` folder up to the Blob store, skipping any already there. The folder is left alone, as a backup. Every recording in it was already named in UTC, so none is renamed.
 *
 * `yarn tsx --env-file=.env --env-file=.env.production.local scripts/upload-lullabies.ts`
 */

const FOLDER = 'lullabies';

async function main() {
  const existing = await listLullabyFiles();
  const files = readdirSync(FOLDER).filter((file) => file.toLowerCase().endsWith('.mp3') && !file.startsWith('.'));

  for (const file of files) {
    if (existing.includes(file)) {
      console.log(`Already uploaded: ${file}`);
    } else {
      await storeLullaby(file, readFileSync(join(FOLDER, file)));
      console.log(`Uploaded: ${file}`);
    }
  }

  console.log('Now in the store:', await listLullabyFiles());
}

main();
