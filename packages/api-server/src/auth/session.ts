import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { getQueryDb, getSessionsTable, getUsersTable } from '../../../db/src/index.js';
import { SESSION_TTL_MS, type AuthUser } from './types.js';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  const pepper = process.env.SESSION_SECRET?.trim() || 'dev-insecure-session-pepper';
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

export function generateOAuthState(): string {
  return randomBytes(24).toString('base64url');
}

export function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

type SessionRow = { id: string; userId: string; expiresAt: string; createdAt: string };
type UserRow = {
  id: string;
  googleSub: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
  };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const db = getQueryDb();
  const table = getSessionsTable();
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await db.insert(table).values({
    id: hashSessionToken(token),
    userId,
    expiresAt,
    createdAt: now.toISOString(),
  });
  return { token, expiresAt };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const db = getQueryDb();
  const table = getSessionsTable();
  await db.delete(table).where(eq(table.id, hashSessionToken(token)));
}

export async function readSession(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const db = getQueryDb();
  const sessions = getSessionsTable();
  const users = getUsersTable();
  const id = hashSessionToken(token);
  const sessionRows = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1)) as SessionRow[];
  const session = sessionRows[0];
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  const userRows = (await db.select().from(users).where(eq(users.id, session.userId)).limit(1)) as UserRow[];
  const user = userRows[0];
  if (!user) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  const remaining = Date.parse(session.expiresAt) - Date.now();
  if (remaining < SESSION_TTL_MS / 2) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  }
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.expiresAt, new Date().toISOString())));
  return toAuthUser(user);
}
