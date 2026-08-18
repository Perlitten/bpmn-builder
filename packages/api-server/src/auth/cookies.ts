import type { CookieOptions, Request, Response } from 'express';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS } from './types.js';

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function attachCookies(req: Request, _res: Response, next: () => void): void {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}

function cookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeMs,
  };
}

function clearOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_MS));
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, clearOptions());
}

export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions(OAUTH_STATE_TTL_MS));
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, clearOptions());
}
