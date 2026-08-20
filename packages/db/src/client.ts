import { neon, Pool } from '@neondatabase/serverless';
import Database from 'better-sqlite3';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { getDbProvider, resolveSqlitePath } from './config.js';
import * as pgSchema from './schema/postgres.js';
import * as sqliteSchema from './schema/sqlite.js';

export type AppDb =
  | ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>
  | ReturnType<typeof drizzleNeon<typeof pgSchema>>
  | ReturnType<typeof drizzlePool<typeof pgSchema>>;

let db: AppDb | null = null;
let sqlite: Database.Database | null = null;
let pool: Pool | null = null;

export function getDb(): AppDb {
  if (db) return db;
  db = createDb();
  return db;
}

export type QueryBuilderChain = {
  from: (table: unknown) => QueryBuilderChain;
  where: (...args: unknown[]) => QueryBuilderChain;
  orderBy: (...args: unknown[]) => QueryBuilderChain;
  limit: (n: number) => QueryBuilderChain;
  offset: (n: number) => QueryBuilderChain;
  set: (values: Record<string, unknown>) => QueryBuilderChain;
  values: (values: unknown) => QueryBuilderChain;
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

export function resetDbForTests(): void {
  sqlite?.close();
  sqlite = null;
  void pool?.end();
  pool = null;
  db = null;
}

function isLocalPgUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

function createDb(): AppDb {
  if (getDbProvider() === 'postgres') {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error('DATABASE_URL is required for postgres provider');
    if (isLocalPgUrl(url)) {
      pool = new Pool({ connectionString: url });
      return drizzlePool(pool, { schema: pgSchema });
    }
    return drizzleNeon(neon(url), { schema: pgSchema });
  }
  const file = resolveSqlitePath();
  sqlite = new Database(file);
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
