import type { ProcessStatus } from '../types/ProcessStatus.js';

const STATUSES: ProcessStatus[] = ['draft', 'published', 'archived', 'template'];

export function isProcessStatus(value: unknown): value is ProcessStatus {
  return typeof value === 'string' && STATUSES.includes(value as ProcessStatus);
}
