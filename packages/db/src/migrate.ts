import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate as migrateNeon } from 'drizzle-orm/neon-http/migrator';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb, getDbDriver } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsPgFolder = path.resolve(__dirname, '../migrations/pg');
const migrationsSqliteFolder = path.resolve(__dirname, '../migrations/sqlite');

type SqliteClient = {
  exec: (ddl: string) => void;
  prepare: (sql: string) => { all: (...args: unknown[]) => Array<{ name: string }> };
};

function sqliteHasTable(sqlite: SqliteClient, table: string): boolean {
  const rows = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).all(table);
  return rows.length > 0;
}

function sqliteHasColumn(sqlite: SqliteClient, table: string, column: string): boolean {
  if (!sqliteHasTable(sqlite, table)) return false;
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

function addSqliteColumnIfMissing(sqlite: SqliteClient, table: string, column: string, definition: string): void {
  if (sqliteHasTable(sqlite, table) && !sqliteHasColumn(sqlite, table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function migrate(): Promise<void> {
  const driver = getDbDriver();
  const db = getDb();

  if (driver === 'postgres') {
    const unpooledUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
    const pooledUrl = process.env.DATABASE_URL?.trim();
    const url = unpooledUrl || pooledUrl;
    if (!url) {
      throw new Error(
        'DATABASE_URL or DATABASE_URL_UNPOOLED is required when DB_PROVIDER=postgres.',
      );
    }

    // Legacy schema migration safety for postgres
    await (db as { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> }).execute(
      sql.raw('ALTER TABLE IF EXISTS processes ADD COLUMN IF NOT EXISTS user_id TEXT'),
    );

    await migrateNeon(db as Parameters<typeof migrateNeon>[0], {
      migrationsFolder: migrationsPgFolder,
    });
    return;
  }

  const sqlite = (db as { $client: SqliteClient }).$client;
  // Legacy schema migration safety for sqlite
  addSqliteColumnIfMissing(sqlite, 'processes', 'user_id', 'TEXT');

  migrateSqlite(db as Parameters<typeof migrateSqlite>[0], {
    migrationsFolder: migrationsSqliteFolder,
  });
}
