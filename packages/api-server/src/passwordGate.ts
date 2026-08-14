import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

type PasswordEnvironment = {
  APP_USER?: string;
  APP_PASSWORD?: string;
};

function equalSecret(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function isAuthorizedBasic(
  authorization: string | undefined,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  if (!authorization?.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return equalSecret(user, expectedUser) && equalSecret(password, expectedPassword);
  } catch {
    return false;
  }
}

export function createPasswordGate(environment: PasswordEnvironment = process.env): RequestHandler {
  return (req, res, next) => {
    const expectedUser = environment.APP_USER?.trim() || 'preview';
    const expectedPassword = environment.APP_PASSWORD || '';

    if (!expectedPassword) {
      res.status(503).type('text/plain').send('APP_PASSWORD is not configured');
      return;
    }
    if (isAuthorizedBasic(req.headers.authorization, expectedUser, expectedPassword)) {
      res.setHeader('Cache-Control', 'private, no-store');
      next();
      return;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="BPMN Builder", charset="UTF-8"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(401).type('text/plain').send('Authentication required');
  };
}
