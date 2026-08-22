import { describe, expect, it } from 'vitest';
import { userFacingPlanError } from './errors.js';

describe('userFacingPlanError', () => {
  it('does not dump modeling-profile catalog copy', () => {
    expect(userFacingPlanError('Not in modeling profile yet')).not.toMatch(/modeling profile/i);
    expect(userFacingPlanError('no semantic create op for boundary.compensation')).not.toMatch(
      /no semantic create op|boundary\.compensation/i,
    );
    expect(userFacingPlanError('unknown component: start.message')).toMatch(/cannot be added/i);
  });

  it('preserves a batch step prefix while mapping the inner error', () => {
    expect(userFacingPlanError('Step 3 (moveToBranch) failed: unknown element: Task_99')).toBe(
      'Step 3 (moveToBranch) failed: That element is not in this process.',
    );
  });

  it('parses an untrusted step error without a backtracking regular expression', () => {
    const padded = `Step 12 (renameElement) failed:${' '.repeat(20_000)}unknown element: Task_404`;
    expect(userFacingPlanError(padded)).toBe(
      'Step 12 (renameElement) failed: That element is not in this process.',
    );
  });
});
