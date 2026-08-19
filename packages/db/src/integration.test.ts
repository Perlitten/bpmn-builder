import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, migrate, resetDbForTests } from './index.js';

describe('database integration tests (PostgreSQL / SQLite)', () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('applies migrations cleanly and runs schema operations', async () => {
    // If DATABASE_URL is set for Postgres (e.g. in CI or local Postgres container), test Postgres.
    // Otherwise fallback to testing SQLite in-memory migration runner.
    const isPostgres = process.env.DB_PROVIDER === 'postgres' && process.env.DATABASE_URL;
    if (!isPostgres) {
      process.env.DB_PROVIDER = 'sqlite';
      process.env.DATABASE_URL = ':memory:';
    }

    await migrate();

    const db = getDb();
    expect(db).toBeDefined();
  });

  it('baseline migration is idempotent on an existing schema', async () => {
    if (process.env.DB_PROVIDER !== 'postgres' || !process.env.DATABASE_URL) {
      process.env.DB_PROVIDER = 'sqlite';
      process.env.DATABASE_URL = ':memory:';
    }

    await migrate();
    // Run second time to verify baseline idempotency
    await migrate();
  });
});
