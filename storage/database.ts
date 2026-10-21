import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Client, createClient, type InValue } from '@libsql/client';

import { getEnvironment } from '@/constants/environment';
import { type Migration, MIGRATIONS } from '@/storage/migrations';
import { formatTimestamp } from '@/storage/timestamps';

/**
 * The tracking log: sleeps, bottles, diapers, and the settings that shape the sleep predictions.
 *
 * On the laptop, migrations run lazily, on the first query after the process starts, so a deploy needs no extra step. In the cloud role they run in the Vercel build instead (`scripts/migrate.ts`), where a failed backup fails the build and the old deployment keeps serving, and the running app only checks that none is pending: it never migrates without that backup. Every migration is additive — new tables and new nullable columns, never a rename or a drop — so the build being replaced keeps working against the migrated schema, and rolling back is only a matter of deploying the old build. Before any migration runs, the whole database is dumped to `backups/` and the dump is replayed into a scratch database to prove it is complete.
 */

const BACKUPS_DIRECTORY = 'backups';
const LOCAL_FILE_PREFIX = 'file:';

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

async function findPendingMigrations(client: Client): Promise<Migration[]> {
  await client.execute('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = await client.execute('SELECT name FROM migrations');
  const appliedNames = new Set(applied.rows.map((row) => String(row.name)));

  return MIGRATIONS.filter((migration) => !appliedNames.has(migration.name));
}

/**
 * Called with the verified backup before any migration runs. A rejection stops the migrations, so the build can refuse to migrate without a copy kept somewhere durable.
 */
type AfterBackup = (path: string) => Promise<void>;

async function migrate(client: Client, afterBackup?: AfterBackup): Promise<number> {
  const pending = await findPendingMigrations(client);

  if (pending.length > 0) {
    const path = await backUpDatabase(client);
    console.warn(`Backed up the tracking database to ${path} before migrating.`);
    await afterBackup?.(path);

    for (const migration of pending) {
      await client.batch([...migration.statements, { args: [migration.name, new Date().toISOString()], sql: 'INSERT INTO migrations (name, applied_at) VALUES (?, ?)' }], 'write');
      console.warn(`Applied the ${migration.name} migration.`);
    }
  }

  return pending.length;
}

let ready: null | Promise<Client> = null;

function createDatabaseClient(): Client {
  const { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } = getEnvironment();

  if (TURSO_DATABASE_URL.startsWith(LOCAL_FILE_PREFIX)) {
    mkdirSync(join(TURSO_DATABASE_URL.slice(LOCAL_FILE_PREFIX.length), '..'), { recursive: true });
  }

  return createClient({ authToken: TURSO_AUTH_TOKEN === '' ? undefined : TURSO_AUTH_TOKEN, url: TURSO_DATABASE_URL });
}

/**
 * For the build: runs every pending migration, after the backup and `afterBackup`, closes the client, and says how many ran.
 */
export async function migrateDatabase(afterBackup: AfterBackup): Promise<number> {
  const client = createDatabaseClient();
  try {
    return await migrate(client, afterBackup);
  } finally {
    client.close();
  }
}

async function connect(): Promise<Client> {
  const client = createDatabaseClient();

  if (getEnvironment().APP_ROLE === 'cloud') {
    const pending = await findPendingMigrations(client);
    if (pending.length > 0) {
      client.close();
      throw new Error(
        `The database is behind this build: ${pending.map((migration) => migration.name).join(', ')} not yet applied. Migrations run in the build (yarn migrate), never here.`,
      );
    }
  } else {
    await migrate(client);
  }

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
