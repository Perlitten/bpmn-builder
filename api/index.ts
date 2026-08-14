import express, { type Express } from 'express';
import { migrate } from '../packages/db/src/index.js';
import { createApp } from '../packages/api-server/src/app.js';
import { createPasswordGate } from '../packages/api-server/src/passwordGate.js';
import { repairEmptyDiagrams, seedIfEmpty } from '../packages/api-server/src/seed.js';

const app: Express = express();

app.disable('x-powered-by');
app.use(createPasswordGate());

let databaseReady: Promise<void> | null = null;
function initializeDatabase(): Promise<void> {
  databaseReady ??= migrate().then(async () => {
    await seedIfEmpty();
    await repairEmptyDiagrams();
  });
  return databaseReady;
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
