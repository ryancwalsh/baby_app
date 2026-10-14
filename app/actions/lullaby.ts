'use server';

import { requireLogin } from '@/auth/login';
import { deleteLullaby, getLullabyName, listLullabyFiles, renameLullaby } from '@/storage/lullabies';

const API_PATH = '/api/lullabies';

export type Lullaby = {
  fileName: string;
  name: string;
  url: string;
};

/**
 * Read at request time rather than baked in at build, so a new recording or a
 * rename shows up on the next load.
 *
 * An `<audio>` element cannot send headers, so the login hash rides along in
 * the url, exactly as the camera's media does it.
 */
export async function getLullabiesAction(secretHash: string): Promise<Lullaby[]> {
  await requireLogin(secretHash);

  return listLullabyFiles().map((fileName) => ({
    fileName,
    name: getLullabyName(fileName),
    url: `${API_PATH}/${encodeURIComponent(fileName)}?secretHash=${encodeURIComponent(secretHash)}`,
  }));
}

/**
 * A refused name is answered rather than thrown, because a production build
 * hides a thrown message from the page and the person renaming needs to see
 * why.
 */
export async function renameLullabyAction(secretHash: string, fileName: string, newName: string): Promise<{ error: null | string }> {
  await requireLogin(secretHash);

  try {
    renameLullaby(fileName, newName);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not rename the lullaby.' };
  }
}

export async function deleteLullabyAction(secretHash: string, fileName: string): Promise<{ error: null | string }> {
  await requireLogin(secretHash);

  try {
    deleteLullaby(fileName);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not delete the lullaby.' };
  }
}
