import type { Application, Request, Response } from 'express';
import { getDbDriver, pingDb } from '@bpmn/db';

export function registerHealthRoutes(app: Application): void {
  app.get('/api/health', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const driver = getDbDriver();
    try {
      await pingDb();
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: { driver, status: 'connected' },
      });
    } catch {
      res.status(503).json({
        status: 'unavailable',
        timestamp: new Date().toISOString(),
        database: { driver, status: 'unavailable' },
      });
    }
  });
}
