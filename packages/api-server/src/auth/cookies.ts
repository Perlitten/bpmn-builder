import type { CookieOptions, Request, Response } from 'express';
import { hashSessionToken } from './session.js';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS } from './types.js';
import { isSecureRequest } from './env.js';

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      if (key === SESSION_COOKIE) out.bpmn_session = value;
      else if (key === OAUTH_STATE_COOKIE) out.bpmn_oauth_state = value;
    } catch {
      const value = part.slice(idx + 1).trim();
      if (key === SESSION_COOKIE) out.bpmn_session = value;
      else if (key === OAUTH_STATE_COOKIE) out.bpmn_oauth_state = value;
    }
  }
  return out;
}

export function attachCookies(req: Request, _res: Response, next: () => void): void {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}

function cookieOptions(req: Request, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: maxAgeMs,
  };
}

function clearOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
  };
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, hashSessionToken(token), cookieOptions(req, SESSION_TTL_MS));
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, clearOptions(req));
}

export function setOAuthStateCookie(req: Request, res: Response, nonce: string): void {
  res.cookie(OAUTH_STATE_COOKIE, nonce, cookieOptions(req, OAUTH_STATE_TTL_MS));
}

export function clearOAuthStateCookie(req: Request, res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, clearOptions(req));
}
