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
});
