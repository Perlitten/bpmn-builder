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

  it('resolves boundary timers, message starts, and event subprocesses as Camunda 8 supported', () => {
    expect(catalogMatch('bpmn:BoundaryEvent', 'TimerEventDefinition')?.id).toBe('boundary.timer');
    expect(catalogMatch('bpmn:BoundaryEvent', 'timerEventDefinition', { cancelActivity: false })?.id).toBe(
      'boundary.timer.nonInterrupting',
    );
    expect(catalogMatch('bpmn:StartEvent', 'MessageEventDefinition')?.engineSupport.camunda8).toBe('supported');
    expect(catalogMatch('bpmn:StartEvent', 'bpmn:MessageEventDefinition')?.id).toBe('start.message');
    expect(catalogMatch('bpmn:SubProcess', undefined, { triggeredByEvent: true })?.id).toBe('activity.eventSubProcess');
    expect(catalogMatch('bpmn:SubProcess', undefined, { triggeredByEvent: false })?.id).toBe('activity.subProcess');
    expect(supportLevel(catalogMatch('bpmn:BoundaryEvent', 'TimerEventDefinition')!.engineSupport, 'camunda8')).toBe(
      'supported',
    );
  });

  it('does not guess when event families mix Camunda 8 and Camunda 7 rows', () => {
    expect(catalogMatch('bpmn:BoundaryEvent')).toBeUndefined();
    expect(catalogMatch('bpmn:IntermediateCatchEvent')).toBeUndefined();
  });
});
