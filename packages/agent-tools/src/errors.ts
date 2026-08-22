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

/** One BPMN sentence for Architect — never raw `addTask: unknown branch: Region_1`. */
export function userFacingPlanError(raw: string): string {
  const text = raw.trim();
  const stepPrefix = 'Step ';
  const open = text.startsWith(stepPrefix) ? text.indexOf(' (', stepPrefix.length) : -1;
  const marker = ') failed:';
  const close = open > stepPrefix.length ? text.indexOf(marker, open + 2) : -1;
  if (close > open + 2) {
    const stepNumber = text.slice(stepPrefix.length, open);
    const validNumber = stepNumber.length > 0 && [...stepNumber].every((char) => char >= '0' && char <= '9');
    const detail = text.slice(close + marker.length).trimStart();
    if (validNumber && detail) {
      return `${text.slice(0, close + marker.length - 1)}: ${userFacingPlanError(detail)}`;
    }
  }
  if (/unknown branch/i.test(text)) {
    return 'Cannot add a task on a region. Use a gateway branch (Yes/No), or omit the branch for the whole process.';
  }
  if (/unknown region/i.test(text)) {
    return 'That gateway region is not in this process.';
  }
  if (/unknown element|unknown node|unknown flow/i.test(text)) {
    return 'That element is not in this process.';
  }
  if (/ambiguous after/i.test(text)) {
    return 'This gateway has several outgoing flows. Pick a branch or insert after the join.';
  }
  if (/no successor after/i.test(text)) {
    return 'Cannot insert a task after that element.';
  }
  if (/is not on branch/i.test(text)) {
    return 'That element is not on the chosen gateway branch.';
  }
  if (/(?:loop|return|back|cycle)/i.test(text) && /(?:flow|connect|add|construct|cannot)/i.test(text)) {
    return 'Return flows are not supported yet. Keep this as a separate branch, or add the return connection manually in the editor.';
  }
  if (/not in modeling profile yet|no semantic create op|unknown component/i.test(text)) {
    return 'That construction cannot be added here. Use a task, a gateway split, or a pool only if you need another participant.';
  }
  return text;
}
