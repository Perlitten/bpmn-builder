import { randomUUID } from 'node:crypto';
import { createSession } from './session.js';
import type { AuthUser } from './types.js';
import { SESSION_COOKIE } from './types.js';
import { upsertGoogleUser } from './users.js';

export async function issueTestSession(input?: {
  googleSub?: string;
  email?: string;
  name?: string;
  avatarUrl?: string | null;
}): Promise<{ user: AuthUser; token: string; cookie: string }> {
  const user = await upsertGoogleUser({
    sub: input?.googleSub ?? `test-sub-${randomUUID()}`,
    email: input?.email ?? `user-${randomUUID()}@example.com`,
    name: input?.name ?? 'Test User',
    picture: input?.avatarUrl ?? null,
  });
  const { token } = await createSession(user.id);
  return { user, token, cookie: `${SESSION_COOKIE}=${token}` };
}
