import type { Application, Request, Response } from 'express';
import { getDbDriver } from '../../../db/src/index.js';

export function registerHealthRoutes(app: Application): void {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: getDbDriver(),
    });
  });
}
