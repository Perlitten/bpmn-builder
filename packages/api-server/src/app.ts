import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRoutes } from './routes/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  registerRoutes(app);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const parseFailed =
      (err instanceof SyntaxError && 'body' in err) ||
      (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed');
    if (parseFailed) {
      res.status(400).json({ error: 'invalid JSON' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
