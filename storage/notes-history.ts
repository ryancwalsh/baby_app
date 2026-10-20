import { applyPatch, createPatch } from 'diff';

import { MILLISECONDS_PER_MINUTE } from '@/constants/time';

/**
 * The version history of the notes, kept small with three ideas, as in the NeighborNotes app it came from:
 *
 * 1. Throttling. The editor saves about a second after typing stops, which would make hundreds of versions a day. Instead, a save starts a new version only when the newest one was started more than VERSION_DURATION_MILLISECONDS ago. Otherwise the newest version is kept, so a stretch of typing becomes one version.
 *
 * 2. Reverse diffs. The current notes are always stored whole, in the `notes` table. A version stores only a patch that turns the text after it back into its own text. Rebuilding a version starts from the current text and applies the patches from the newest version down to it, so the recent versions, which are the ones that get restored, are the cheapest to rebuild.
 *
 * 3. Checkpoints. Every CHECKPOINT_INTERVAL-th version stores its whole text instead of a patch. Rebuilding starts at the nearest checkpoint, so it never applies more than CHECKPOINT_INTERVAL - 1 patches, and a damaged patch cannot break the versions behind the checkpoint before it.
 *
 * This file has no database code. storage/notes.ts stores what it decides.
 */

const VERSION_DURATION_MINUTES = 10;
export const VERSION_DURATION_MILLISECONDS = VERSION_DURATION_MINUTES * MILLISECONDS_PER_MINUTE;
export const CHECKPOINT_INTERVAL = 50;

/**
 * The patches never leave this module, so the file name in their header is only a label.
 */
const PATCH_FILE_NAME = 'notes';

export type VersionKind = 'full' | 'patch';

export type StoredVersion = {
  body: string;
  createdAt: string;
  id: number;
  kind: VersionKind;
};

/**
 * Makes the patch that turns newerText back into olderText.
 */
export function makeReversePatch(newerText: string, olderText: string): string {
  return createPatch(PATCH_FILE_NAME, newerText, olderText);
}

/**
 * Turns newerText into the text of the version, by applying its patch or by taking its whole text. A patch carries a few lines around each change, and applying it fails when they do not match, so a damaged chain throws instead of quietly returning the wrong text.
 */
export function applyVersion(newerText: string, version: Pick<StoredVersion, 'body' | 'id' | 'kind'>): string {
  let olderText = version.body;
  if (version.kind === 'patch') {
    const patched = applyPatch(newerText, version.body);
    if (patched === false) {
      throw new Error(`The patch of note version ${version.id} does not apply.`);
    }

    olderText = patched;
  }

  return olderText;
}

/**
 * Rebuilds the text of the last version in versionsNewestFirst. The list must run without gaps from the newest version (or from a checkpoint, whose whole text makes the versions newer than it unnecessary) down to the wanted version.
 */
export function rebuildText(currentText: string, versionsNewestFirst: Array<Pick<StoredVersion, 'body' | 'id' | 'kind'>>): string {
  let text = currentText;
  for (const version of versionsNewestFirst) {
    text = applyVersion(text, version);
  }

  return text;
}

/**
 * What a save must do to the version history, as decided by planSave.
 */
export type VersionChange = { action: 'insert'; body: string; kind: VersionKind } | { action: 'none' } | { action: 'update'; body: string; id: number };

/**
 * Decides how a save changes the version history.
 *
 * - previousText is the text that the save replaces.
 * - newestVersion is the newest stored version, if there is one.
 * - versionsSinceCheckpoint counts the versions newer than the newest checkpoint, or all of them when there is no checkpoint.
 */
export function planSave({
  newestVersion,
  newText,
  now,
  previousText,
  versionsSinceCheckpoint,
}: {
  newestVersion: null | StoredVersion;
  newText: string;
  now: Date;
  previousText: string;
  versionsSinceCheckpoint: number;
}): VersionChange {
  const isNewestVersionRecent = newestVersion !== null && now.getTime() - new Date(newestVersion.createdAt).getTime() < VERSION_DURATION_MILLISECONDS;
  let change: VersionChange = { action: 'none' };
  if (newText === previousText) {
    change = { action: 'none' };
  } else if (isNewestVersionRecent) {
    /**
     * The newest version keeps recording the text from before this stretch of typing. Its patch was made against previousText, so it is made again against newText. A checkpoint holds its whole text and needs nothing.
     */
    if (newestVersion.kind === 'patch') {
      const newestVersionText = applyVersion(previousText, newestVersion);
      change = { action: 'update', body: makeReversePatch(newText, newestVersionText), id: newestVersion.id };
    }
  } else if (versionsSinceCheckpoint >= CHECKPOINT_INTERVAL - 1) {
    change = { action: 'insert', body: previousText, kind: 'full' };
  } else {
    /**
     * The version that used to be the newest needs no change. Its patch turns previousText into its text, and previousText is exactly what this new version records.
     */
    change = { action: 'insert', body: makeReversePatch(newText, previousText), kind: 'patch' };
  }

  return change;
}
