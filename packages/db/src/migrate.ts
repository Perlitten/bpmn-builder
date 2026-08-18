import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from './client.js';

/**
 * Bootstrap only. Do not CREATE INDEX on processes(user_id) here:
 * existing DBs already have `processes` without that column, and
 * CREATE TABLE IF NOT EXISTS will not add it.
 */
const SQLITE_BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  bpmn_xml TEXT NOT NULL,
  workflow_json TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS processes_updated_at_idx ON processes (updated_at DESC);
`.trim();

const POSTGRES_BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  bpmn_xml TEXT NOT NULL,
  workflow_json TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS processes_updated_at_idx ON processes (updated_at DESC);
`.trim();

type SqliteClient = {
  exec: (ddl: string) => void;
  prepare: (sql: string) => { all: () => Array<{ name: string }> };
};

function sqliteHasColumn(sqlite: SqliteClient, table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

function addSqliteColumnIfMissing(sqlite: SqliteClient, table: string, column: string, definition: string): void {
  if (sqliteHasColumn(sqlite, table, column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function migrate(): Promise<void> {
  const driver = getDbDriver();
  const database = getDb();

  if (driver === 'postgres') {
    const statements = [
      ...POSTGRES_BOOTSTRAP.split(';').map((part) => part.trim()).filter(Boolean),
      'ALTER TABLE processes ADD COLUMN IF NOT EXISTS user_id TEXT',
      'CREATE INDEX IF NOT EXISTS processes_user_id_idx ON processes (user_id)',
    ];
    for (const statement of statements) {
      await (database as { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> }).execute(
        sql.raw(statement),
      );
    }
    return;
  }

  const sqlite = (database as { $client: SqliteClient }).$client;
  sqlite.exec(SQLITE_BOOTSTRAP);
  addSqliteColumnIfMissing(sqlite, 'processes', 'user_id', 'TEXT');
  sqlite.exec('CREATE INDEX IF NOT EXISTS processes_user_id_idx ON processes (user_id)');
}
