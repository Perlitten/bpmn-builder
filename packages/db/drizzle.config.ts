import { defineConfig } from 'drizzle-kit';

const provider = process.env.DB_PROVIDER ?? 'sqlite';

const pgUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/bpmn';

export default defineConfig(
  provider === 'postgres'
    ? {
        schema: './src/schema/postgres.ts',
        out: './migrations/pg',
        dialect: 'postgresql',
        dbCredentials: { url: pgUrl },
      }
    : {
        schema: './src/schema/sqlite.ts',
        out: './migrations/sqlite',
        dialect: 'sqlite',
        dbCredentials: { url: resolveSqliteUrl() },
      },
);

function resolveSqliteUrl(): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/bpmn.db';
  return url.startsWith('file:') ? url.slice('file:'.length) : url;
}
