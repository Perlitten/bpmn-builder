import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE } from './types.js';
import { readSession } from './session.js';

export function attachSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api')) {
    next();
    return;
  }
  void readSession(req.cookies?.[SESSION_COOKIE])
    .then((user) => {
      req.user = user ?? undefined;
      next();
    })
    .catch(next);
}

export function isPublicApiPath(path: string): boolean {
  return path === '/api/health' || path.startsWith('/api/auth');
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api') || isPublicApiPath(req.path)) {
    next();
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
}
