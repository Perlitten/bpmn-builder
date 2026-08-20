import type { Request, Response } from 'express';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS } from './types.js';

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      cookies.set(key, decodeURIComponent(part.slice(idx + 1).trim()));
    } catch {
      cookies.set(key, part.slice(idx + 1).trim());
    }
  }
  return Object.fromEntries(cookies);
}

export function attachCookies(req: Request, _res: Response, next: () => void): void {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
}

export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: OAUTH_STATE_TTL_MS,
  });
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
}
