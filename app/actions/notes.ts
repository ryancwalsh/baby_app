'use server';

import { requireLogin } from '@/auth/login';
import { getNotes, getNoteVersionText, listNoteVersions, type Notes, type NoteVersionSummary, saveNotes, type SaveNotesResult } from '@/storage/notes';

/**
 * Server actions can be called by anyone who finds them, so each one checks the login again.
 */

export async function getNotesAction(secretHash: string): Promise<Notes> {
  await requireLogin(secretHash);

  return getNotes();
}

/**
 * Called by the editor a moment after typing stops. Restoring a version also goes through here, so a restore can be undone like any other save.
 */
export async function saveNotesAction(secretHash: string, content: string, expectedUpdatedAt: null | string): Promise<SaveNotesResult> {
  await requireLogin(secretHash);

  return saveNotes(content, expectedUpdatedAt);
}

export async function listNoteVersionsAction(secretHash: string): Promise<NoteVersionSummary[]> {
  await requireLogin(secretHash);

  return listNoteVersions();
}

export async function getNoteVersionTextAction(secretHash: string, versionId: number): Promise<null | string> {
  await requireLogin(secretHash);

  return getNoteVersionText(versionId);
}
