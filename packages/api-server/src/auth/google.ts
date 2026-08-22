import type { GoogleAuthConfig } from './env.js';
import type { GoogleProfile } from './users.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_HTTP_TIMEOUT_MS = 10_000;

export function googleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type UserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  error?: string;
};

export async function exchangeGoogleCode(
  config: GoogleAuthConfig,
  input: { code: string; redirectUri: string },
): Promise<GoogleProfile> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(GOOGLE_HTTP_TIMEOUT_MS),
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as TokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error('Google token exchange failed');
  }
  const userRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(GOOGLE_HTTP_TIMEOUT_MS),
  });
  const profile = (await userRes.json().catch(() => ({}))) as UserInfoResponse;
  if (!userRes.ok || !profile.sub || !profile.email) {
    throw new Error('Google did not return an email for this account');
  }
  return {
    sub: profile.sub,
    email: profile.email,
    name: profile.name ?? null,
    picture: profile.picture ?? null,
  };
}
