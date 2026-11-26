'use server';

import { requireLogin } from '@/auth/login';
import { deleteLullaby, getLullabyName, listLullabyFiles, renameLullaby } from '@/storage/lullabies';
import { applyLullabyOrder, getLullabyOrder, renameInLullabyOrder, saveLullabyOrder } from '@/storage/lullaby-order';

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

  const [fileNames, order] = await Promise.all([listLullabyFiles(), getLullabyOrder()]);

  return applyLullabyOrder(fileNames, order).map((fileName) => ({
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
    await renameInLullabyOrder(fileName, await renameLullaby(fileName, newName));

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not rename the lullaby.' };
  }
}

export async function deleteLullabyAction(secretHash: string, fileName: string): Promise<{ error: null | string }> {
  await requireLogin(secretHash);

  try {
    await deleteLullaby(fileName);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not delete the lullaby.' };
  }
}

/**
 * The whole list in its new order, as dragged on one phone. Every other phone picks it up the next time it loads the list.
 */
export async function saveLullabyOrderAction(secretHash: string, fileNames: string[]): Promise<{ error: null | string }> {
  await requireLogin(secretHash);

  try {
    await saveLullabyOrder(fileNames.map(String));

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save the order.' };
  }
}
