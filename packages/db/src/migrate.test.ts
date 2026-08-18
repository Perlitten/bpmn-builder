import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, migrate, resetDbForTests } from './index.js';

type SqliteClient = {
  exec: (ddl: string) => void;
  prepare: (sql: string) => { all: () => Array<Record<string, unknown>> };
};

function sqliteClient(): SqliteClient {
  return (getDb() as { $client: SqliteClient }).$client;
}

describe('sqlite migrate user_id', () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
    delete process.env.SQLITE_PATH;
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('adds user_id to a legacy processes table and leaves existing rows unowned', async () => {
    const sqlite = sqliteClient();
    sqlite.exec(`
      CREATE TABLE processes (
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
    `);
    sqlite.exec(`
      INSERT INTO processes (id, name, status, bpmn_xml, version, created_at, updated_at)
      VALUES ('legacy', 'Legacy process', 'draft', '<xml/>', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `);

    await migrate();
    await migrate();

    const cols = sqlite.prepare('PRAGMA table_info(processes)').all() as Array<{ name: string }>;
    expect(cols.some((col) => col.name === 'user_id')).toBe(true);
    const rows = sqlite.prepare('SELECT id, user_id FROM processes').all() as Array<{
      id: string;
      user_id: string | null;
    }>;
    expect(rows).toEqual([{ id: 'legacy', user_id: null }]);
  });
});
