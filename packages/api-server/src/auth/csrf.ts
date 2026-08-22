import type { NextFunction, Request, Response } from 'express';
import { requestOrigin } from './env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-bpmn-csrf';

function normaliseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Cookie-authenticated API writes require a non-simple request header. Origin
 * and Fetch Metadata are checked as a second boundary when browsers provide
 * them. The header is intentionally not a secret; browsers cannot attach it
 * cross-origin without a successful CORS preflight, which this app never grants.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api') || SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const fetchSite = req.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'cross-site') {
    res.status(403).json({ error: 'Cross-site request blocked' });
    return;
  }

  const origin = req.get('origin');
  if (origin && normaliseOrigin(origin) !== requestOrigin(req)) {
    res.status(403).json({ error: 'Cross-site request blocked' });
    return;
  }

  if (req.get(CSRF_HEADER) !== '1') {
    res.status(403).json({ error: 'CSRF protection header is required' });
    return;
  }
  next();
}
