'use server';

import { readdirSync } from 'node:fs';

import { requireLogin } from '@/lib/login';

const LULLABIES_DIRECTORY = 'public/lullabies';
const PUBLIC_PATH = '/lullabies';

export type Lullaby = {
  name: string;
  url: string;
};

/**
 * Read at request time rather than baked in at build, so dropping an mp3 into
 * `public/lullabies` is enough to have it show up on the next load.
 */
export async function getLullabiesAction(secretHash: string): Promise<Lullaby[]> {
  await requireLogin(secretHash);

  let files: string[] = [];
  try {
    files = readdirSync(LULLABIES_DIRECTORY);
  } catch {
    /**
     * No folder yet means no lullabies, which is not an error.
     */
  }

  return files
    .filter((file) => file.toLowerCase().endsWith('.mp3'))
    .sort((first, second) => first.localeCompare(second))
    .map((file) => ({
      name: file.replace(/\.mp3$/iu, '').replaceAll(/[_-]+/gu, ' '),
      url: `${PUBLIC_PATH}/${encodeURIComponent(file)}`,
    }));
}
