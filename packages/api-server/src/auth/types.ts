export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export const SESSION_COOKIE = 'bpmn_session';
export const OAUTH_STATE_COOKIE = 'bpmn_oauth_state';
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_HANDOFF_TTL_MS = 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      cookies: Record<string, string>;
      user?: AuthUser;
    }
  }
}

export {};
