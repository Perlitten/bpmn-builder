import type { LintResult } from '@bpmn/rules';

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
export function listQualitySignal(lint: LintResult): ListQualitySignal | null {
  const labels: string[] = [];
  const titles: string[] = [];
  if (lint.errors.length) {
    labels.push(counted(lint.errors.length, 'error', 'errors'));
    titles.push('BPMN');
  }
  if (lint.warnings.length) {
    labels.push(counted(lint.warnings.length, 'warning', 'warnings'));
    titles.push(lint.warnings.some((finding) => finding.layer === 2) ? 'Execution' : 'Quality');
  }
  if (lint.style.length) {
    labels.push(counted(lint.style.length, 'style finding', 'style findings'));
    titles.push('Style');
  }
  if (!labels.length) return null;
  const tone = lint.errors.length ? 'error' : lint.warnings.length ? 'warning' : 'style';
  return signal(labels.join(' · '), titles.join(' · '), tone);
}
