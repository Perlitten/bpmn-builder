import { describe, expect, it } from 'vitest';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import { bpmnJsReplacePayload } from './replaceTargets';

describe('bpmn-js replace payloads', () => {
  it('resolves user task and exclusive gateway from bpmn-js replace options', () => {
    expect(bpmnJsReplacePayload(bpmnComponentRegistry.get('activity.userTask')!)).toEqual({
      type: 'bpmn:UserTask',
    });
    expect(bpmnJsReplacePayload(bpmnComponentRegistry.get('gateway.exclusive')!)).toMatchObject({
      type: 'bpmn:ExclusiveGateway',
    });
    expect(bpmnJsReplacePayload(bpmnComponentRegistry.get('start.timer')!)).toMatchObject({
      type: 'bpmn:StartEvent',
      eventDefinitionType: 'bpmn:TimerEventDefinition',
    });
  });
});
