import type { Application, Request, Response } from 'express';
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  setOAuthStateCookie,
  setSessionCookie,
} from '../auth/cookies.js';
import { googleCallbackUrl, publicOrigin, readGoogleAuthConfig } from '../auth/env.js';
import { exchangeGoogleCode, googleAuthorizeUrl } from '../auth/google.js';
import { createSession, destroySession, equalSecret, generateOAuthState } from '../auth/session.js';
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from '../auth/types.js';
import { upsertGoogleUser } from '../auth/users.js';

function redirectHome(res: Response, origin: string, error?: string): void {
  const url = new URL('/', origin);
  if (error) url.searchParams.set('error', error);
  res.redirect(url.toString());
}

export function registerAuthRoutes(app: Application): void {
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const origin = publicOrigin(req);
    const callbackUrl = googleCallbackUrl(origin);
    const config = readGoogleAuthConfig();
    if (!config.ok) {
      res.json({
        configured: false,
        error: config.error.replaceAll('{origin}', origin),
        callbackUrl,
      });
      return;
    }
    res.json({ configured: true, callbackUrl });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    res.json({ user: req.user });
  });

  app.get('/api/auth/google', (req: Request, res: Response) => {
    const config = readGoogleAuthConfig();
    if (!config.ok) {
      res.status(503).json({ error: config.error });
      return;
    }
    const origin = publicOrigin(req);
    const state = generateOAuthState();
    setOAuthStateCookie(res, state);
    res.redirect(googleAuthorizeUrl({
      clientId: config.value.clientId,
      redirectUri: googleCallbackUrl(origin),
      state,
    }));
  });

  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    const origin = publicOrigin(req);
    const config = readGoogleAuthConfig();
    if (!config.ok) {
      redirectHome(res, origin, 'config');
      return;
    }
    const denied = typeof req.query.error === 'string' ? req.query.error : '';
    if (denied) {
      clearOAuthStateCookie(res);
      redirectHome(res, origin, denied === 'access_denied' ? 'denied' : 'oauth');
      return;
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const expected = req.cookies?.[OAUTH_STATE_COOKIE] ?? '';
    clearOAuthStateCookie(res);
    if (!code || !state || !expected || !equalSecret(state, expected)) {
      redirectHome(res, origin, 'state');
      return;
    }
    try {
      const profile = await exchangeGoogleCode(config.value, {
        code,
        redirectUri: googleCallbackUrl(origin),
      });
      const user = await upsertGoogleUser(profile);
      const { token } = await createSession(user.id);
      setSessionCookie(res, token);
      redirectHome(res, origin);
    } catch {
      redirectHome(res, origin, 'oauth');
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    await destroySession(req.cookies?.[SESSION_COOKIE]);
    clearSessionCookie(res);
    res.json({ ok: true });
  });
}
