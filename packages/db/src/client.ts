import { neon } from '@neondatabase/serverless';
import Database from 'better-sqlite3';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { getDbProvider, resolveSqlitePath } from './config.js';
import * as pgSchema from './schema/postgres.js';
import * as sqliteSchema from './schema/sqlite.js';

export type AppDb =
  | ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>
  | ReturnType<typeof drizzleNeon<typeof pgSchema>>;

let db: AppDb | null = null;
let sqlite: Database.Database | null = null;

export function getDb(): AppDb {
  if (db) return db;
  db = createDb();
  return db;
}

/** sqlite/pg union is not callable; query APIs match for this app. */
export function getQueryDb() {
  return getDb() as unknown as {
    select: (fields?: object) => any;
    insert: (table: unknown) => any;
    update: (table: unknown) => any;
    delete: (table: unknown) => any;
  };
}

export function getDbDriver(): 'sqlite' | 'postgres' {
  return getDbProvider();
}

export function resetDbForTests(): void {
  sqlite?.close();
  sqlite = null;
  db = null;
}

function createDb(): AppDb {
  if (getDbProvider() === 'postgres') {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error('DATABASE_URL is required for postgres provider');
    return drizzleNeon(neon(url), { schema: pgSchema });
  }
  const file = resolveSqlitePath();
  sqlite = new Database(file);
  if (file !== ':memory:') sqlite.pragma('journal_mode = WAL');
  return drizzleSqlite(sqlite, { schema: sqliteSchema });
}

export function getProcessesTable() {
  return getDbProvider() === 'postgres' ? pgSchema.processes : sqliteSchema.processes;
}
