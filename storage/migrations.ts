/**
 * Every schema change to the tracking database, in order, run by `storage/database.ts`. Keep them additive — new tables and new nullable columns, never a rename or a drop — and never edit one that has already run; add a new one with a new name.
 */

export type Migration = {
  name: string;
  statements: string[];
};

export const MIGRATIONS: Migration[] = [
  {
    name: '2026-10-19_tracking',
    statements: [
      `CREATE TABLE sleeps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        note TEXT NOT NULL DEFAULT ''
      )`,
      'CREATE INDEX sleeps_started_at ON sleeps (started_at)',
      `CREATE TABLE bottles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prepared_at TEXT NOT NULL,
        touched_lips_at TEXT,
        amount_milliliters INTEGER NOT NULL,
        drank_milliliters INTEGER,
        note TEXT NOT NULL DEFAULT ''
      )`,
      'CREATE INDEX bottles_prepared_at ON bottles (prepared_at)',
      `CREATE TABLE diapers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        changed_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT ''
      )`,
      'CREATE INDEX diapers_changed_at ON diapers (changed_at)',
      /**
       * One row, always: the check keeps a second from ever being inserted.
       */
      `CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        prediction_method TEXT NOT NULL DEFAULT 'fixed',
        birth_date TEXT,
        two_nap_wake_window_minutes TEXT NOT NULL,
        three_nap_wake_window_minutes TEXT NOT NULL
      )`,
      `INSERT INTO settings (id, two_nap_wake_window_minutes, three_nap_wake_window_minutes) VALUES (1, '[180,210,240]', '[135,150,165,180]')`,
    ],
  },
  /**
   * The prepared amount became optional, but `amount_milliliters` is `NOT NULL` and SQLite cannot relax that without rebuilding the table. So the amount moves to a nullable column, and `amount_milliliters` is still written — as 0 when no amount was given — so the build before this one keeps working after a rollback.
   */
  {
    name: '2026-10-19_optional_prepared_amount',
    statements: ['ALTER TABLE bottles ADD COLUMN prepared_milliliters INTEGER', 'UPDATE bottles SET prepared_milliliters = amount_milliliters'],
  },
  /**
   * The notes about the app, linked from the footer. One row of markdown, and its earlier versions as reverse patches — see storage/notes-history.ts.
   */
  {
    name: '2026-10-20_notes',
    statements: [
      `CREATE TABLE notes (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE note_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        text_saved_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    ],
  },
  /**
   * The day versus night cut-off times. Left null until someone saves them, which reads as the defaults in storage/tracking-types.ts.
   */
  {
    name: '2026-10-21_day_night_times',
    statements: ['ALTER TABLE settings ADD COLUMN day_starts_at TEXT', 'ALTER TABLE settings ADD COLUMN day_ends_at TEXT'],
  },
  /**
   * Whether a day's totals start at midnight or at the day start time. Null reads as midnight, which is how they were counted before.
   */
  {
    name: '2026-10-21_day_totals_from',
    statements: ['ALTER TABLE settings ADD COLUMN day_totals_from TEXT'],
  },
  /**
   * What the laptop kept in memory or in files, moved here so the app can run on serverless instances too: device cloud tokens, the login throttle, and the Nanit's last known state for when the laptop is off. Times are UTC ISO strings.
   */
  {
    name: '2026-10-21_cloud_state',
    statements: [
      'CREATE TABLE stored_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)',
      'CREATE TABLE login_failures (client TEXT PRIMARY KEY, failure_count INTEGER NOT NULL, first_failed_at TEXT NOT NULL)',
      'CREATE TABLE device_state (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)',
    ],
  },
  /**
   * Webcam mode's introductions, which were held in one process's memory. Each phone's event stream polls these, so phones on different serverless instances still find each other. `stream_id` tells a phone's current stream from an older one of the same phone that is only now closing.
   */
  {
    name: '2026-10-21_webcam_signaling',
    statements: [
      'CREATE TABLE webcam_camera (slot INTEGER PRIMARY KEY CHECK (slot = 1), camera_id TEXT NOT NULL, stream_id TEXT NOT NULL, started_at TEXT NOT NULL, heartbeat_at TEXT NOT NULL)',
      'CREATE TABLE webcam_watchers (watcher_id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, heartbeat_at TEXT NOT NULL)',
      'CREATE TABLE webcam_retired_cameras (camera_id TEXT PRIMARY KEY, retired_at TEXT NOT NULL)',
      'CREATE TABLE webcam_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient_id TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL)',
      'CREATE INDEX webcam_signals_recipient ON webcam_signals (recipient_id, id)',
    ],
  },
  /**
   * Every value a stored secret had before it was replaced, so that a bad write of the Tapo refresh token, which cannot be got back any other way, can be undone by hand.
   */
  {
    name: '2026-10-21_stored_secret_history',
    statements: [
      'CREATE TABLE stored_secret_history (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, replaced_at TEXT NOT NULL)',
    ],
  },
  /**
   * Medicines given, with the dose in ml. The amount is `REAL` because a dose is often a fraction of a ml, such as 2.5.
   */
  {
    name: '2026-10-24_medicines',
    statements: [
      `CREATE TABLE medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        given_at TEXT NOT NULL,
        name TEXT NOT NULL,
        amount_milliliters REAL NOT NULL
      )`,
      'CREATE INDEX medicines_given_at ON medicines (given_at)',
    ],
  },
];
