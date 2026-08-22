import { allFindings, type Finding, type FindingSeverity, type LintResult } from '@bpmn/rules';

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  error: 0,
  warning: 1,
  style: 2,
  suggestion: 3,
};

/** Collapse rule-layer duplicates that point at the same problem and element. */
export function presentedFindings(lint: LintResult): Finding[] {
  const result: Finding[] = [];
  const indexes = new Map<string, number>();
  for (const finding of allFindings(lint)) {
    const key = `${finding.elementId ?? 'process'}\0${finding.message.trim().toLocaleLowerCase()}`;
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, result.length);
      result.push(finding);
      continue;
    }
    const existing = result[existingIndex]!;
    if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[existing.severity]) result[existingIndex] = finding;
  }
  return result;
}
