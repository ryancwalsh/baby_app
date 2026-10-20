import { type Transaction, type TransactionMode } from '@libsql/client';

import { getDatabase, query } from '@/storage/database';
import { planSave, rebuildText, type StoredVersion, type VersionKind } from '@/storage/notes-history';

/**
 * The notes about the app, one markdown document shared by everyone who can log in. Times are UTC ISO strings, like the rest of the database; `updated_at` is also compared exactly to notice a save from elsewhere.
 */

/**
 * The notes are a single row, so it always has this id.
 */
const NOTES_ID = 1;

export type Notes = {
  content: string;
  /**
   * Null until the first save.
   */
  updatedAt: null | string;
};

export type SaveNotesResult =
  /**
   * Someone saved in between, for example on another phone. Saving anyway would overwrite their text, so nothing was saved.
   */
  { status: 'conflict' } | { status: 'saved'; updatedAt: string };

export type NoteVersionSummary = { id: number; textSavedAt: string };

/**
 * A write transaction is opened by libSQL with `BEGIN IMMEDIATE`, so two saves cannot interleave between the check and the writes. Closing without the commit rolls back.
 */
async function inTransaction<T>(mode: TransactionMode, work: (transaction: Transaction) => Promise<T>): Promise<T> {
  const client = await getDatabase();
  const transaction = await client.transaction(mode);
  try {
    const result = await work(transaction);
    await transaction.commit();

    return result;
  } finally {
    transaction.close();
  }
}

async function readNotes(transaction: Transaction): Promise<Notes | null> {
  const result = await transaction.execute({ args: [NOTES_ID], sql: 'SELECT content, updated_at FROM notes WHERE id = ?' });
  const [row] = result.rows;

  return row === undefined ? null : { content: String(row.content), updatedAt: String(row.updated_at) };
}

export async function getNotes(): Promise<Notes> {
  const result = await query('SELECT content, updated_at FROM notes WHERE id = ?', [NOTES_ID]);
  const [row] = result.rows;

  return row === undefined ? { content: '', updatedAt: null } : { content: String(row.content), updatedAt: String(row.updated_at) };
}

/**
 * Saves the notes and records the text that they replace in the version history, as storage/notes-history.ts decides.
 *
 * expectedUpdatedAt is the updatedAt that the editor last loaded or saved. If the stored one differs, somebody saved in between, and the save is refused instead of overwriting it.
 */
export async function saveNotes(content: string, expectedUpdatedAt: null | string): Promise<SaveNotesResult> {
  return inTransaction('write', async (transaction) => {
    const notes = await readNotes(transaction);
    let result: SaveNotesResult = { status: 'conflict' };
    if ((notes?.updatedAt ?? null) === expectedUpdatedAt) {
      const now = new Date();
      /**
       * The very first save replaces nothing, so it has no earlier text to record.
       */
      if (notes !== null) {
        const newest = await transaction.execute('SELECT id, kind, body, created_at FROM note_versions ORDER BY id DESC LIMIT 1');
        const [newestRow] = newest.rows;
        const newestVersion: null | StoredVersion =
          newestRow === undefined
            ? null
            : { body: String(newestRow.body), createdAt: String(newestRow.created_at), id: Number(newestRow.id), kind: String(newestRow.kind) as VersionKind };
        const sinceCheckpoint = await transaction.execute(
          "SELECT COUNT(*) AS count FROM note_versions WHERE id > COALESCE((SELECT MAX(id) FROM note_versions WHERE kind = 'full'), 0)",
        );
        const change = planSave({
          newestVersion,
          newText: content,
          now,
          previousText: notes.content,
          versionsSinceCheckpoint: Number(sinceCheckpoint.rows[0]?.count),
        });
        if (change.action === 'insert') {
          await transaction.execute({
            args: [change.kind, change.body, notes.updatedAt, now.toISOString()],
            sql: 'INSERT INTO note_versions (kind, body, text_saved_at, created_at) VALUES (?, ?, ?, ?)',
          });
        } else if (change.action === 'update') {
          await transaction.execute({ args: [change.body, change.id], sql: 'UPDATE note_versions SET body = ? WHERE id = ?' });
        }
      }

      const updatedAt = now.toISOString();
      await transaction.execute({
        args: [NOTES_ID, content, updatedAt],
        sql: 'INSERT INTO notes (id, content, updated_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at',
      });
      result = { status: 'saved', updatedAt };
    }

    return result;
  });
}

/**
 * The versions, newest first, without their bodies, which only mean something once rebuilt.
 */
export async function listNoteVersions(): Promise<NoteVersionSummary[]> {
  const result = await query('SELECT id, text_saved_at FROM note_versions ORDER BY id DESC');

  return result.rows.map((row) => ({ id: Number(row.id), textSavedAt: String(row.text_saved_at) }));
}

/**
 * Rebuilds the text of one version. It loads only the versions from the nearest checkpoint at or above it down to it, or, when there is no such checkpoint, from the newest version down to it, starting from the current text.
 *
 * In a transaction, so that a save cannot change the notes between reading the current text and reading the patches.
 */
export async function getNoteVersionText(versionId: number): Promise<null | string> {
  return inTransaction('read', async (transaction) => {
    const checkpoint = await transaction.execute({ args: [versionId], sql: "SELECT MIN(id) AS id FROM note_versions WHERE kind = 'full' AND id >= ?" });
    const checkpointId = checkpoint.rows[0]?.id ?? null;
    const versions = await transaction.execute({
      args: [versionId, checkpointId],
      sql: 'SELECT id, kind, body FROM note_versions WHERE id >= ?1 AND (?2 IS NULL OR id <= ?2) ORDER BY id DESC',
    });
    const versionsNewestFirst = versions.rows.map((row) => ({ body: String(row.body), id: Number(row.id), kind: String(row.kind) as VersionKind }));
    const notes = await readNotes(transaction);

    return notes !== null && versionsNewestFirst.at(-1)?.id === versionId ? rebuildText(notes.content, versionsNewestFirst) : null;
  });
}
