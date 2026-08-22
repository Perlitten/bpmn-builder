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
  hashOAuthStateNonce,
  parseOAuthState,
  readSession,
} from '../auth/session.js';
import { OAUTH_HANDOFF_TTL_MS, OAUTH_STATE_COOKIE, SESSION_COOKIE } from '../auth/types.js';
import { issueTestSession } from '../auth/testSession.js';
import { updateUserName, upsertGoogleUser } from '../auth/users.js';

function redirectHome(res: Response, origin: string, error?: string): void {
  const url = new URL('/', origin);
  if (error) url.searchParams.set('error', error);
  res.redirect(url.toString());
}

function canonicalOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.username || url.password || url.origin !== origin) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function exactVercelOrigin(value: string | undefined): string | null {
  const host = value?.trim().replace(/^https?:\/\//, '');
  if (!host || host.includes('/') || host.includes('@')) return null;
  return canonicalOrigin(`https://${host}`);
}

function matchesConfiguredRelay(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return canonicalOrigin(pattern.replace(/\/$/, '')) === origin;
  if ((pattern.match(/\*/g) ?? []).length !== 1) return false;
  if (!/^https:\/\/[a-z0-9.-]*\*[a-z0-9.-]+$/i.test(pattern)) return false;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[a-z0-9-]+');
  return new RegExp(`^${escaped}$`, 'i').test(origin);
}

/** Only explicit origins, project-specific wildcard patterns, and this deployment are relay targets. */
export function isSafeRelayOrigin(origin: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const candidate = canonicalOrigin(origin);
  if (!candidate) return false;
  const url = new URL(candidate);
  if (
    env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  ) {
    return true;
  }
  if (url.protocol !== 'https:') return false;

  const configured = (env.OAUTH_RELAY_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const deploymentOrigins = [
    exactVercelOrigin(env.VERCEL_URL),
    exactVercelOrigin(env.VERCEL_BRANCH_URL),
    exactVercelOrigin(env.VERCEL_PROJECT_PRODUCTION_URL),
    env.AUTH_BASE_URL ? canonicalOrigin(env.AUTH_BASE_URL.trim().replace(/\/$/, '')) : null,
  ].filter((value): value is string => Boolean(value));
  return deploymentOrigins.includes(candidate) || configured.some((pattern) => matchesConfiguredRelay(candidate, pattern));
}

export function registerAuthRoutes(app: Application): void {
  const authRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 60,
    // The E2E suite intentionally exercises many fresh sessions in one process.
    // Only its explicit marker bypasses the limiter, and only in NODE_ENV=test.
    skip: (req) => process.env.NODE_ENV === 'test' && req.get('x-bpmn-e2e') === '1',
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
        user: req.user ?? null,
      });
      return;
    }
    res.json({ configured: true, callbackUrl, user: req.user ?? null });
  });

  app.get('/api/auth/me', authRateLimit, (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    res.json({ user: req.user });
  });

  app.patch('/api/auth/me', authRateLimit, async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    if (name.trim().length > 80) {
      res.status(400).json({ error: 'name must be at most 80 characters' });
      return;
    }
    try {
      const user = await updateUserName(req.user.id, name);
      if (!user) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({ user });
    } catch {
      res.status(500).json({ error: 'Failed to update profile' });
    }
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
    if (!parsedState) {
      res.status(400).json({ error: 'Invalid OAuth state' });
      return;
    }
    if (parsedState.returnOrigin && !isSafeRelayOrigin(parsedState.returnOrigin)) {
      res.status(400).json({ error: 'Invalid OAuth return origin' });
      return;
    }

    setOAuthStateCookie(res, hashOAuthStateNonce(parsedState.nonce));
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
    const parsedState = parseOAuthState(state);
    const expected = req.cookies?.[OAUTH_STATE_COOKIE] ?? '';
    if (
      !state ||
      !parsedState?.nonce ||
      !expected ||
      !equalSecret(hashOAuthStateNonce(parsedState.nonce), expected)
    ) {
      clearOAuthStateCookie(res);
      redirectHome(res, authOrigin, 'state');
      return;
    }

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
        const complete = new URL('/', returnOrigin);
        complete.hash = `auth_token=${encodeURIComponent(handoffToken)}`;
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

  app.post('/api/auth/complete', authRateLimit, async (req: Request, res: Response) => {
    const handoffToken = typeof req.body?.token === 'string' ? req.body.token : '';
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (!handoffToken) {
      res.status(400).json({ error: 'Invalid OAuth handoff' });
      return;
    }

    try {
      const user = await readSession(handoffToken, { refresh: false });
      await destroySession(handoffToken);
      if (!user) {
        res.status(401).json({ error: 'Invalid OAuth handoff' });
        return;
      }
      const { token } = await createSession(user.id);
      setSessionCookie(res, token);
      res.json({ ok: true });
    } catch {
      res.status(401).json({ error: 'Invalid OAuth handoff' });
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
