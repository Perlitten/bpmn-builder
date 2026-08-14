import type { ValidationIssue } from '../../../domain/src/index.js';
import type { Response } from 'express';

export class ProcessValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'ProcessValidationError';
    this.issues = issues.length ? issues : [{ code: 'invalid_process', message }];
  }
}

export function sendProcessError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof ProcessValidationError) {
    res.status(400).json({ error: error.message, issues: error.issues });
    return;
  }
  res.status(500).json({ error: error instanceof Error ? error.message : fallback });
}
