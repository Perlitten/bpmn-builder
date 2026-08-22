import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getQueryDb, getUsersTable } from '../../../db/src/index.js';
import type { AuthUser } from './types.js';

export type GoogleProfile = {
  sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
};

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

export async function upsertGoogleUser(profile: GoogleProfile): Promise<AuthUser> {
  const db = getQueryDb();
  const table = getUsersTable();
  const now = new Date().toISOString();
  const name = profile.name?.trim() || null;
  const avatarUrl = profile.picture?.trim() || null;
  const created: UserRow = {
    id: randomUUID(),
    googleSub: profile.sub,
    email: profile.email,
    name,
    avatarUrl,
    createdAt: now,
    updatedAt: now,
  };
  await db
    .insert(table)
    .values(created)
    .onConflictDoUpdate({
      target: table.googleSub,
      set: { email: profile.email, name, avatarUrl, updatedAt: now },
    });
  const rows = (await db
    .select()
    .from(table)
    .where(eq(table.googleSub, profile.sub))
    .limit(1)) as UserRow[];
  const row = rows[0];
  if (!row) throw new Error('Google user upsert did not return a user');
  return toAuthUser(row);
}

export async function updateUserName(userId: string, rawName: string): Promise<AuthUser | null> {
  const name = rawName.trim();
  if (name.length > 80) throw new Error('name must be at most 80 characters');
  const db = getQueryDb();
  const table = getUsersTable();
  const now = new Date().toISOString();
  await db.update(table).set({ name: name || null, updatedAt: now }).where(eq(table.id, userId));
  const rows = (await db.select().from(table).where(eq(table.id, userId)).limit(1)) as UserRow[];
  return rows[0] ? toAuthUser(rows[0]) : null;
}
