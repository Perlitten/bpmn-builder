import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from './client.js';

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
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

const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
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

export async function migrate(): Promise<void> {
  const driver = getDbDriver();
  const database = getDb();

  if (driver === 'postgres') {
    const statements = POSTGRES_DDL.split(';')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await (database as { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> }).execute(
        sql.raw(statement),
      );
    }
    return;
  }

  const sqlite = (database as { $client: { exec: (ddl: string) => void } }).$client;
  sqlite.exec(SQLITE_DDL);
}
