import { defineConfig } from 'drizzle-kit';

const provider = process.env.DB_PROVIDER ?? 'sqlite';

export default defineConfig(
  provider === 'postgres'
    ? {
        schema: './src/schema.pg.ts',
        out: './migrations/pg',
        dialect: 'postgresql',
        dbCredentials: { url: process.env.DATABASE_URL! },
      }
    : {
        schema: './src/schema.sqlite.ts',
        out: './migrations/sqlite',
        dialect: 'sqlite',
        dbCredentials: { url: resolveSqliteUrl() },
      },
);

function resolveSqliteUrl(): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/bpmn.db';
  return url.startsWith('file:') ? url.slice('file:'.length) : url;
}
