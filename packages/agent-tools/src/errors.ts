export class ToolPlanError extends Error {
  readonly code = 'TOOL_PLAN';

  constructor(message: string) {
    super(message);
    this.name = 'ToolPlanError';
  }
}

export function isToolPlanError(error: unknown): error is ToolPlanError {
  return error instanceof ToolPlanError || (error instanceof Error && error.name === 'ToolPlanError');
}
