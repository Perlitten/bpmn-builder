import { userFacingPlanError } from '@bpmn/agent-tools';

const FALLBACK = 'Could not apply that change.';

/** One BPMN sentence for the canvas notice — never `ambiguous after Gateway_1: pass branchId`. */
export function editorNoticeText(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error ?? '')).trim();
  if (!text) return FALLBACK;
  if (/ambiguous after/i.test(text)) {
    return 'This gateway has several branches. Pick the branch to insert into, or select its flow first.';
  }
  if (/ambiguous before/i.test(text)) {
    return 'Several flows arrive here. Select the flow you want to insert on.';
  }
  if (/^unknown flow/i.test(text)) return 'That sequence flow is no longer in this process.';
  if (/cannot insert an end/i.test(text)) return 'End cannot be inserted where the flow continues.';
  return userFacingPlanError(text) || FALLBACK;
}

/** Operational notices beat first-run onboarding — otherwise a split insert looks like a no-op. */
export function visibleEditorChrome(
  onboarding: boolean,
  hint: string | null,
): 'hint' | 'onboarding' | null {
  if (hint) return 'hint';
  if (onboarding) return 'onboarding';
  return null;
}
