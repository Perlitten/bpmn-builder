import { describe, expect, it } from 'vitest';
import { get } from '@bpmn/semantic-core';
import { catalogMatch, supportLevel } from './execution.js';

describe('execution profile catalog', () => {
  it('resolves uniquely typed Zeebe-unsupported IR elements', () => {
    expect(catalogMatch('bpmn:ComplexGateway')?.id).toBe('gateway.complex');
    expect(catalogMatch('bpmn:AdHocSubProcess')?.id).toBe('activity.adHocSubProcess');
    expect(catalogMatch('bpmn:Transaction')?.id).toBe('activity.transaction');
    expect(catalogMatch('ComplexGateway')?.id).toBe('gateway.complex');

    const complex = get('gateway.complex')!;
    const adHoc = get('activity.adHocSubProcess')!;
    expect(supportLevel(complex.engineSupport, 'camunda8')).toBe('unsupported');
    expect(supportLevel(adHoc.engineSupport, 'zeebe')).toBe('partial');
  });

  it('does not guess when several catalog rows share a BPMN type', () => {
    expect(catalogMatch('bpmn:StartEvent')).toBeUndefined();
    expect(catalogMatch('bpmn:ExclusiveGateway')?.id).toBe('gateway.exclusive');
  });
});
