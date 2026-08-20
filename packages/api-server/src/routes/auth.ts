import type { Application, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  setOAuthStateCookie,
  setSessionCookie,
} from '../auth/cookies.js';
import { googleCallbackUrl, publicOrigin, requestOrigin, readGoogleAuthConfig } from '../auth/env.js';
import { exchangeGoogleCode, googleAuthorizeUrl } from '../auth/google.js';
import {
  createSession,
  destroySession,
  equalSecret,
  generateOAuthState,
  hashOAuthState,
  parseOAuthState,
  readSession,
} from '../auth/session.js';
import { OAUTH_HANDOFF_TTL_MS, OAUTH_STATE_COOKIE, SESSION_COOKIE } from '../auth/types.js';
import { issueTestSession } from '../auth/testSession.js';
import { upsertGoogleUser } from '../auth/users.js';

function redirectHome(res: Response, origin: string, error?: string): void {
  const url = new URL('/', origin);
  if (error) url.searchParams.set('error', error);
  res.redirect(url.toString());
}

function isSafeRelayOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol === 'http:') {
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    }
    return url.protocol === 'https:' && (url.hostname.endsWith('.vercel.app') || url.hostname.endsWith('.vercel.sh'));
  } catch {
    return false;
  }
}

export function registerAuthRoutes(app: Application): void {
  const authRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication requests. Try again later.' },
  });

  app.get('/api/auth/status', authRateLimit, (req: Request, res: Response) => {
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

  app.get('/api/auth/me', authRateLimit, (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    res.json({ user: req.user });
  });

  app.get('/api/auth/google', authRateLimit, (req: Request, res: Response) => {
    const config = readGoogleAuthConfig();
    if (!config.ok) {
      res.status(503).json({ error: config.error });
      return;
    }

    const requestBase = requestOrigin(req);
    const authBase = publicOrigin(req);
    const suppliedState = typeof req.query.state === 'string' ? req.query.state : undefined;

    if (requestBase !== authBase) {
      const relayState = generateOAuthState(requestBase);
      const relayStart = new URL('/api/auth/google', authBase);
      relayStart.searchParams.set('state', relayState);
      res.redirect(relayStart.toString());
      return;
    }

    const state = suppliedState ?? generateOAuthState();
    const parsedState = parseOAuthState(state);
    if (parsedState?.returnOrigin && !isSafeRelayOrigin(parsedState.returnOrigin)) {
      res.status(400).json({ error: 'Invalid OAuth return origin' });
      return;
    }

    setOAuthStateCookie(res, hashOAuthState(state));
    res.redirect(
      googleAuthorizeUrl({
        clientId: config.value.clientId,
        redirectUri: googleCallbackUrl(authBase),
        state,
      }),
    );
  });

  app.get('/api/auth/google/callback', authRateLimit, async (req: Request, res: Response) => {
    const authOrigin = publicOrigin(req);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const expected = req.cookies?.[OAUTH_STATE_COOKIE] ?? '';
    if (!state || !expected || !equalSecret(hashOAuthState(state), expected)) {
      clearOAuthStateCookie(res);
      redirectHome(res, authOrigin, 'state');
      return;
    }

    const parsedState = parseOAuthState(state);
    const returnOrigin = parsedState?.returnOrigin;
    const targetOrigin = returnOrigin && isSafeRelayOrigin(returnOrigin) ? returnOrigin : authOrigin;

    const config = readGoogleAuthConfig();
    if (!config.ok) {
      redirectHome(res, targetOrigin, 'config');
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    clearOAuthStateCookie(res);
    if (!code) {
      redirectHome(res, targetOrigin, req.query.error === 'access_denied' ? 'denied' : 'oauth');
      return;
    }

    try {
      const profile = await exchangeGoogleCode(config.value, {
        code,
        redirectUri: googleCallbackUrl(authOrigin),
      });
      const user = await upsertGoogleUser(profile);

      if (returnOrigin && isSafeRelayOrigin(returnOrigin)) {
        const { token: handoffToken } = await createSession(user.id, OAUTH_HANDOFF_TTL_MS);
        const complete = new URL('/api/auth/complete', returnOrigin);
        complete.searchParams.set('token', handoffToken);
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.redirect(complete.toString());
        return;
      }

      const { token } = await createSession(user.id);
      setSessionCookie(res, token);
      redirectHome(res, authOrigin);
    } catch {
      redirectHome(res, targetOrigin, 'oauth');
    }
  });

  app.get('/api/auth/complete', authRateLimit, async (req: Request, res: Response) => {
    const origin = requestOrigin(req);
    const handoffToken = typeof req.query.token === 'string' ? req.query.token : '';
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!handoffToken) {
      redirectHome(res, origin, 'oauth');
      return;
    }

    try {
      const user = await readSession(handoffToken, { refresh: false });
      await destroySession(handoffToken);
      if (!user) {
        redirectHome(res, origin, 'oauth');
        return;
      }
      const { token } = await createSession(user.id);
      setSessionCookie(res, token);
      redirectHome(res, origin);
    } catch {
      redirectHome(res, origin, 'oauth');
    }
  });

  app.post('/api/auth/logout', authRateLimit, async (req: Request, res: Response) => {
    await destroySession(req.cookies?.[SESSION_COOKIE]);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Guarded test-session endpoint strictly prohibited in NODE_ENV=production
  const isProduction = process.env.NODE_ENV === 'production';
  const testAuthEnabled = process.env.ENABLE_TEST_AUTH === 'true';

  if (!isProduction && testAuthEnabled) {
    console.warn('[SECURITY WARNING] Test auth endpoint POST /api/auth/test-session is REGISTERED.');
    app.post('/api/auth/test-session', authRateLimit, async (req: Request, res: Response) => {
      const email = typeof req.body?.email === 'string' ? req.body.email : undefined;
      const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
      const { user, token } = await issueTestSession({ email, name });
      setSessionCookie(res, token);
      res.json({ ok: true, user, token });
    });
  }
}
