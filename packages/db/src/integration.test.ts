import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb, migrate, resetDbForTests } from './index.js';

type SqliteClient = {
  exec: (ddl: string) => void;
  prepare: (sql: string) => { all: () => Array<{ name: string }> };
};

describe('database integration tests (PostgreSQL / SQLite)', () => {
  const snapshot = { ...process.env };

  beforeEach(async () => {
    await resetDbForTests();
  });

  afterEach(async () => {
    await resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('applies migrations cleanly and runs schema operations', async () => {
    const isPostgres = process.env.DB_PROVIDER === 'postgres' && process.env.DATABASE_URL;
    if (!isPostgres) {
      process.env.DB_PROVIDER = 'sqlite';
      process.env.DATABASE_URL = ':memory:';
    }

    await migrate();

    const db = getDb();
    expect(db).toBeDefined();
  });

  it('baseline migration is idempotent on an existing schema without __drizzle_migrations journal', async () => {
    const isPostgres = process.env.DB_PROVIDER === 'postgres' && process.env.DATABASE_URL;
    if (!isPostgres) {
      process.env.DB_PROVIDER = 'sqlite';
      process.env.DATABASE_URL = ':memory:';
    }

    // Pre-create tables simulating a database that already has schema before Drizzle migrations were introduced
    const db = getDb();
    if (isPostgres) {
      const pgDb = db as unknown as { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> };
      const statements = [
        'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL, name TEXT, avatar_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS processes (id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT \'draft\', bpmn_xml TEXT NOT NULL, workflow_json TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
      ];
      for (const stmt of statements) {
        await pgDb.execute(sql.raw(stmt));
      }
    } else {
      const sqlite = (db as unknown as { $client: SqliteClient }).$client;
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL, name TEXT, avatar_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS processes (id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'draft', bpmn_xml TEXT NOT NULL, workflow_json TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      `);
    }

    // Apply baseline migration over pre-existing tables without __drizzle_migrations
    await migrate();
  });
});
