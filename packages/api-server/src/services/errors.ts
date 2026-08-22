import type { ValidationIssue } from '@bpmn/domain';
import type { Response } from 'express';

export class ProcessValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'ProcessValidationError';
    this.issues = issues.length ? issues : [{ code: 'invalid_process', message }];
  }
}

export class ProcessConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super('version conflict');
    this.name = 'ProcessConflictError';
    this.currentVersion = currentVersion;
  }
}

export function sendProcessError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof ProcessValidationError) {
    res.status(400).json({ error: error.message, issues: error.issues });
    return;
  }
  if (error instanceof ProcessConflictError) {
    res.status(409).json({ error: error.message, currentVersion: error.currentVersion });
    return;
  }
  res.status(500).json({ error: fallback });
}
