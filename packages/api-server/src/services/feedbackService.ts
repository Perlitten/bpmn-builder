import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getFeedbackTable, getQueryDb } from '../../../db/src/index.js';

export const FEEDBACK_CATEGORIES = ['general', 'bug', 'idea', 'ux', 'question'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export type Feedback = {
  id: string;
  category: FeedbackCategory;
  message: string;
  page: string | null;
  processId: string | null;
  status: 'new' | 'reviewed' | 'resolved';
  createdAt: string;
  updatedAt: string;
};

export type FeedbackRequester = {
  id: string;
  email: string;
};

type FeedbackRow = Omit<Feedback, 'category' | 'status'> & {
  category: string;
  status: string;
  userId: string;
};

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackValidationError';
  }
}

function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    category: FEEDBACK_CATEGORIES.includes(row.category as FeedbackCategory)
      ? (row.category as FeedbackCategory)
      : 'general',
    message: row.message,
    page: row.page,
    processId: row.processId,
    status: row.status === 'reviewed' || row.status === 'resolved' ? row.status : 'new',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function optionalText(value: unknown, max: number, label: string): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new FeedbackValidationError(`${label} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new FeedbackValidationError(`${label} must be at most ${max} characters`);
  return trimmed || null;
}

export async function createFeedback(input: {
  userId: string;
  category?: unknown;
  message?: unknown;
  page?: unknown;
  processId?: unknown;
}): Promise<Feedback> {
  const category = input.category == null || input.category === '' ? 'general' : input.category;
  if (typeof category !== 'string' || !FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) {
    throw new FeedbackValidationError('category is invalid');
  }
  if (typeof input.message !== 'string' || !input.message.trim()) {
    throw new FeedbackValidationError('message is required');
  }
  const message = input.message.trim();
  if (message.length > 5000) throw new FeedbackValidationError('message must be at most 5000 characters');
  const page = optionalText(input.page, 256, 'page');
  const processId = optionalText(input.processId, 128, 'processId');
  const now = new Date().toISOString();
  const row: FeedbackRow = {
    id: randomUUID(),
    userId: input.userId,
    category,
    message,
    page,
    processId,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };
  const db = getQueryDb();
  await db.insert(getFeedbackTable()).values(row);
  return toFeedback(row);
}

/**
 * Feedback is private by default. A single configured inbox owner may see
 * every submission, which makes the feedback form useful for a product owner
 * without exposing other users' messages to ordinary accounts.
 */
export function isFeedbackInboxOwner(email: string): boolean {
  const configured = process.env.FEEDBACK_INBOX_EMAIL?.trim().toLocaleLowerCase();
  return Boolean(configured && configured === email.trim().toLocaleLowerCase());
}

export async function listFeedback(requester: FeedbackRequester, limit = 50): Promise<Feedback[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const table = getFeedbackTable();
  const db = getQueryDb();
  const status = eq(table.status, 'new');
  const where = isFeedbackInboxOwner(requester.email)
    ? status
    : and(eq(table.userId, requester.id), status);
  const rows = (await db.select().from(table).where(where).orderBy(desc(table.createdAt)).limit(safeLimit)) as FeedbackRow[];
  return rows.map(toFeedback);
}
