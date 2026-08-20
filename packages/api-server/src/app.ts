import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { attachCookies } from './auth/cookies.js';
import { attachSession, requireAuth } from './auth/middleware.js';
import { rateLimit } from './http/rateLimit.js';
import './auth/types.js';
import { registerRoutes } from './routes/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

function operationalHeaders(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const supplied = req.header('x-request-id')?.trim();
  const requestId = supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(rateLimit({ windowMs: 60_000, max: 300 }));
  app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 30 }));
  app.use(operationalHeaders);
  app.use(express.json({ limit: '2mb' }));
  app.use(attachCookies);
  app.use(attachSession);
  app.use(requireAuth);
  registerRoutes(app);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    const requestId = String(res.getHeader('X-Request-Id') ?? 'unknown');
    const error = err instanceof Error ? { name: err.name, message: err.message } : { message: String(err) };
    process.stderr.write(`${JSON.stringify({
      level: 'error',
      event: 'request_failed',
      requestId,
      method: req.method,
      path: req.path,
      error,
    })}\n`);
    res.status(500).json({ error: 'Internal server error', requestId });
  });
  return app;
}
