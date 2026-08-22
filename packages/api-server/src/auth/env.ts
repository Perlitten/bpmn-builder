export type GoogleAuthConfig = {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
};

export const AUTH_SETUP_HINT =
  'Google sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET (openssl rand -hex 32). In Google Cloud Console create an OAuth 2.0 Web client and add Authorized redirect URI {origin}/api/auth/google/callback (local: http://localhost:5173/api/auth/google/callback).';

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

export function sessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.SESSION_SECRET?.trim() ?? '';
  if (value.length >= 16) return value;
  if (env.NODE_ENV !== 'production') return 'dev-insecure-session-pepper';
  throw new AuthConfigurationError(
    value
      ? 'SESSION_SECRET must be at least 16 characters.'
      : 'Session authentication is unavailable because SESSION_SECRET is not configured.',
  );
}

function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function requestOrigin(req: {
  get: (name: string) => string | undefined;
  protocol?: string;
}): string {
  const proto =
    (req.get('x-forwarded-proto') ?? req.protocol ?? 'http').split(',')[0]?.trim() || 'http';
  const host = (req.get('x-forwarded-host') ?? req.get('host') ?? 'localhost:5173')
    .split(',')[0]
    ?.trim();
  return normalizeOrigin(`${proto}://${host}`) || 'http://localhost:5173';
}

export function configuredAuthOrigin(): string | null {
  const configured = process.env.AUTH_BASE_URL?.trim();
  return configured ? normalizeOrigin(configured) || null : null;
}

/**
 * The OAuth callback origin. Preview can point this at one stable staging
 * deployment while requestOrigin(req) keeps the originating dynamic preview.
 */
export function publicOrigin(req: {
  get: (name: string) => string | undefined;
  protocol?: string;
}): string {
  return configuredAuthOrigin() ?? requestOrigin(req);
}

export function googleCallbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/auth/google/callback`;
}

export function readGoogleAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; value: GoogleAuthConfig } | { ok: false; error: string } {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  const sessionSecret = env.SESSION_SECRET?.trim() ?? '';
  const missing = [
    !clientId ? 'GOOGLE_CLIENT_ID' : null,
    !clientSecret ? 'GOOGLE_CLIENT_SECRET' : null,
    !sessionSecret ? 'SESSION_SECRET' : null,
  ].filter((name): name is string => Boolean(name));
  if (missing.length > 0) {
    return { ok: false, error: AUTH_SETUP_HINT };
  }
  if (sessionSecret.length < 16) {
    return {
      ok: false,
      error: 'SESSION_SECRET must be at least 16 characters. Generate one with: openssl rand -hex 32',
    };
  }
  return { ok: true, value: { clientId, clientSecret, sessionSecret } };
}
