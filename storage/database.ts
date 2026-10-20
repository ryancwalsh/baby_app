import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Client, createClient, type InValue } from '@libsql/client';

import { getEnvironment } from '@/constants/environment';
import { formatTimestamp } from '@/storage/lullabies';

/**
 * The tracking log: sleeps, bottles, diapers, and the settings that shape the sleep predictions.
 *
 * Migrations run lazily, on the first query after the process starts, so a deploy needs no extra step. Every migration is additive — new tables and new nullable columns, never a rename or a drop — so the build being replaced keeps working against the migrated schema, and rolling back is only a matter of deploying the old build. Before any migration runs, the whole database is dumped to `backups/` and the dump is replayed into a scratch database to prove it is complete.
 */

const BACKUPS_DIRECTORY = 'backups';
const LOCAL_FILE_PREFIX = 'file:';

type Migration = {
  name: string;
  statements: string[];
};

const MIGRATIONS: Migration[] = [
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
];

function quote(value: unknown): string {
  let quoted = '';
  if (value === null || value === undefined) {
    quoted = 'NULL';
  } else if (typeof value === 'number' || typeof value === 'bigint') {
    quoted = String(value);
  } else if (value instanceof ArrayBuffer) {
    quoted = `X'${Buffer.from(value).toString('hex')}'`;
  } else {
    quoted = `'${String(value).replaceAll("'", "''")}'`;
  }

  return quoted;
}

async function countRows(client: Client, tableNames: string[]) {
  const counts = new Map<string, number>();
  for (const tableName of tableNames) {
    const result = await client.execute(`SELECT COUNT(*) AS count FROM "${tableName}"`);
    counts.set(tableName, Number(result.rows[0]?.count));
  }

  return counts;
}

/**
 * A plain SQL dump: schema, then every row, then indexes. It is replayed into an in-memory database and the row counts compared table by table, so a backup that would not restore is caught before the migration it was taken for.
 */
async function backUpDatabase(client: Client): Promise<string> {
  const tables = await client.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const indexes = await client.execute("SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name");
  const tableNames = tables.rows.map((row) => String(row.name));
  const lines: string[] = [];

  for (const table of tables.rows) {
    lines.push(`${String(table.sql)};`);
    const rows = await client.execute(`SELECT * FROM "${String(table.name)}"`);
    for (const row of rows.rows) {
      const values = rows.columns.map((column) => quote(row[column]));
      lines.push(`INSERT INTO "${String(table.name)}" (${rows.columns.map((column) => `"${column}"`).join(', ')}) VALUES (${values.join(', ')});`);
    }
  }

  for (const index of indexes.rows) {
    lines.push(`${String(index.sql)};`);
  }

  const dump = lines.join('\n');
  mkdirSync(BACKUPS_DIRECTORY, { recursive: true });
  const path = join(BACKUPS_DIRECTORY, `${formatTimestamp(new Date())}_tracking.sql`);
  writeFileSync(path, dump);

  const scratch = createClient({ url: ':memory:' });
  try {
    await scratch.executeMultiple(dump);
    const originalCounts = await countRows(client, tableNames);
    const restoredCounts = await countRows(scratch, tableNames);
    for (const tableName of tableNames) {
      if (originalCounts.get(tableName) !== restoredCounts.get(tableName)) {
        throw new Error(`The backup at ${path} does not restore ${tableName} completely, so the migration was not run.`);
      }
    }
  } finally {
    scratch.close();
  }

  return path;
}

async function migrate(client: Client) {
  await client.execute('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = await client.execute('SELECT name FROM migrations');
  const appliedNames = new Set(applied.rows.map((row) => String(row.name)));
  const pending = MIGRATIONS.filter((migration) => !appliedNames.has(migration.name));

  if (pending.length > 0) {
    const path = await backUpDatabase(client);
    console.warn(`Backed up the tracking database to ${path} before migrating.`);

    for (const migration of pending) {
      await client.batch([...migration.statements, { args: [migration.name, new Date().toISOString()], sql: 'INSERT INTO migrations (name, applied_at) VALUES (?, ?)' }], 'write');
      console.warn(`Applied the ${migration.name} migration.`);
    }
  }
}

let ready: null | Promise<Client> = null;

async function connect(): Promise<Client> {
  const { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } = getEnvironment();

  if (TURSO_DATABASE_URL.startsWith(LOCAL_FILE_PREFIX)) {
    mkdirSync(join(TURSO_DATABASE_URL.slice(LOCAL_FILE_PREFIX.length), '..'), { recursive: true });
  }

  const client = createClient({ authToken: TURSO_AUTH_TOKEN === '' ? undefined : TURSO_AUTH_TOKEN, url: TURSO_DATABASE_URL });
  await migrate(client);

  return client;
}

/**
 * One client for the process, migrated once. A failed start is forgotten, so the next request tries again rather than inheriting the failure.
 */
async function connectOrForget(): Promise<Client> {
  try {
    return await connect();
  } catch (error) {
    ready = null;
    throw error;
  }
}

export async function getDatabase(): Promise<Client> {
  ready ??= connectOrForget();

  return ready;
}

export async function query(sql: string, args: InValue[] = []) {
  const client = await getDatabase();

  return client.execute({ args, sql });
}
