import { expect, it } from 'vitest';
import type { LintResult } from '@bpmn/rules';
import { presentedFindings } from './lintPresentation';

it('presents the same element/message once at the strongest severity', () => {
  const duplicate = { id: 'name', elementId: 'Task_1', message: 'Task has no name' };
  const lint = {
    errors: [],
    warnings: [{ ...duplicate, severity: 'warning', layer: 3 }],
    style: [{ ...duplicate, severity: 'style', layer: 5 }],
    suggestions: [],
    scores: { bpmn: 100, style: 80, quality: 80 },
    layout: 'canonical',
    executionProfile: 'none',
  } satisfies LintResult;
  expect(presentedFindings(lint)).toEqual([expect.objectContaining({ severity: 'warning' })]);
});
