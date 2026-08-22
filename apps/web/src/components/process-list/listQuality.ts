import type { LintResult } from '@bpmn/rules';
import type { ProcessQualitySummary } from '@bpmn/domain';

export type ListQualitySignal = {
  label: string;
  text: string;
  title: string;
  tone: 'error' | 'warning' | 'style';
};

function counted(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

function signal(label: string, title: string, tone: ListQualitySignal['tone']): ListQualitySignal {
  return { label, text: label, title, tone };
}

/** List chrome: one findings signal, or nothing when clean. Layer scores stay in the inspector. */
export function listQualitySignal(lint: LintResult | ProcessQualitySummary): ListQualitySignal | null {
  const errors = Array.isArray(lint.errors) ? lint.errors.length : lint.errors;
  const warnings = Array.isArray(lint.warnings) ? lint.warnings.length : lint.warnings;
  const style = Array.isArray(lint.style) ? lint.style.length : lint.style;
  const labels: string[] = [];
  const titles: string[] = [];
  if (errors) {
    labels.push(counted(errors, 'error', 'errors'));
    titles.push('BPMN');
  }
  if (warnings) {
    labels.push(counted(warnings, 'warning', 'warnings'));
    titles.push(Array.isArray(lint.warnings) && lint.warnings.some((finding) => finding.layer === 2) ? 'Execution' : 'Quality');
  }
  if (style) {
    labels.push(counted(style, 'style finding', 'style findings'));
    titles.push('Style');
  }
  if (!labels.length) return null;
  const tone = errors ? 'error' : warnings ? 'warning' : 'style';
  return signal(labels.join(' · '), titles.join(' · '), tone);
}
