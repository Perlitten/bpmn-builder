import { neon } from '@neondatabase/serverless';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { getDbProvider, resolveSqlitePath } from './config.js';
import * as pgSchema from './schema/postgres.js';
import * as sqliteSchema from './schema/sqlite.js';

export function isNeonUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return (
      parsed.hostname.endsWith('.neon.tech') ||
      parsed.hostname.endsWith('.neon.build') ||
      parsed.hostname.includes('.neon.')
    );
  } catch {
    return urlString.includes('.neon.tech') || urlString.includes('.neon.build');
  }
}

export type AppDb =
  | ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>
  | ReturnType<typeof drizzleNeon<typeof pgSchema>>
  | ReturnType<typeof drizzlePg<typeof pgSchema>>;

let db: AppDb | null = null;
let sqlite: Database.Database | null = null;
let pgPool: pg.Pool | null = null;

export function getDb(): AppDb {
  if (db) return db;
  db = createDb();
  return db;
}

type QueryBuilderChain = {
  from: (table: unknown) => QueryBuilderChain;
  where: (...args: unknown[]) => QueryBuilderChain;
  orderBy: (...args: unknown[]) => QueryBuilderChain;
  limit: (n: number) => QueryBuilderChain;
  offset: (n: number) => QueryBuilderChain;
  set: (values: Record<string, unknown>) => QueryBuilderChain;
  values: (values: unknown) => QueryBuilderChain;
  onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => QueryBuilderChain;
  returning: (fields?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  then: <TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
};

export type DbQueryClient = {
  select: (fields?: Record<string, unknown>) => QueryBuilderChain;
  insert: (table: unknown) => QueryBuilderChain;
  update: (table: unknown) => QueryBuilderChain;
  delete: (table: unknown) => QueryBuilderChain;
};

/** sqlite/pg union is not callable; query APIs match for this app. */
export function getQueryDb(): DbQueryClient {
  return getDb() as unknown as DbQueryClient;
}

export function getDbDriver(): 'sqlite' | 'postgres' {
  return getDbProvider();
}

/** Executes a real database round-trip for readiness checks. */
export async function pingDb(): Promise<void> {
  const database = getDb();
  if (getDbProvider() === 'postgres') {
    const executable = database as unknown as {
      execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
    };
    await executable.execute(sql`select 1`);
    return;
  }
  const client = (database as unknown as { $client: Database.Database }).$client;
  client.prepare('select 1').get();
}

export async function resetDbForTests(): Promise<void> {
  sqlite?.close();
  sqlite = null;
  if (pgPool) {
    const poolToClose = pgPool;
    pgPool = null;
    await poolToClose.end();
  }
  db = null;
}

function createDb(): AppDb {
  if (getDbProvider() === 'postgres') {
    const url = process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL_UNPOOLED?.trim();
    if (!url) throw new Error('DATABASE_URL is required for postgres provider');
    if (isNeonUrl(url)) {
      return drizzleNeon(neon(url), { schema: pgSchema });
    }
    pgPool = new pg.Pool({ connectionString: url });
    return drizzlePg(pgPool, { schema: pgSchema });
  }
  const file = resolveSqlitePath();
  sqlite = new Database(file);
  sqlite.function('unicode_lower', { deterministic: true }, (value: unknown) =>
    value == null ? '' : String(value).normalize('NFKC').toLocaleLowerCase(),
  );
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  if (file !== ':memory:') sqlite.pragma('journal_mode = WAL');
  return drizzleSqlite(sqlite, { schema: sqliteSchema });
}

export function getProcessesTable() {
  return getDbProvider() === 'postgres' ? pgSchema.processes : sqliteSchema.processes;
}

export function getUsersTable() {
  return getDbProvider() === 'postgres' ? pgSchema.users : sqliteSchema.users;
}

export function getSessionsTable() {
  return getDbProvider() === 'postgres' ? pgSchema.sessions : sqliteSchema.sessions;
}

export function getFeedbackTable() {
  return getDbProvider() === 'postgres' ? pgSchema.feedback : sqliteSchema.feedback;
}
