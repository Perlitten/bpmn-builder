import express, { type Express } from 'express';
import { migrate } from '@bpmn/db';
import { createApp } from '../packages/api-server/src/app.js';
import { repairEmptyDiagrams, seedIfEmpty } from '../packages/api-server/src/seed.js';

const app: Express = express();

app.disable('x-powered-by');

let databaseReady: Promise<void> | null = null;
export function initializeDatabase(): Promise<void> {
  databaseReady ??= migrate()
    .then(async () => {
      await seedIfEmpty();
      await repairEmptyDiagrams();
    })
    .catch((error: unknown) => {
      databaseReady = null;
      throw error;
    });
  return databaseReady;
}

export function resetDatabaseInitializationForTests(): void {
  databaseReady = null;
}

app.use(async (_req, res, next) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    console.error('[database] initialization failed', error);
    res.status(503).json({ error: 'Database is unavailable' });
  }
});

app.use(createApp());
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
