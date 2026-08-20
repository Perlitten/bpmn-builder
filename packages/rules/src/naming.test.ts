import { describe, expect, it } from 'vitest';
import { hasActionVerb, shouldCheckActionVerb, suggestName, type NameContext } from './naming.js';

function ctx(partial: Partial<NameContext> & Pick<NameContext, 'id' | 'type'>): NameContext {
  return { name: '', incoming: [], outgoing: [], ...partial };
}

describe('suggestName', () => {
  it('proposes a question for a technical XOR split name', () => {
    const fromNeighbor = suggestName(
      ctx({
        id: 'Gateway_17',
        type: 'bpmn:ExclusiveGateway',
        name: 'Gateway_17',
        incoming: [{ id: 'Activity_1', type: 'bpmn:Task', name: 'Validate customer' }],
        outgoing: [
          { id: 'A', type: 'bpmn:Task', name: 'Task' },
          { id: 'B', type: 'bpmn:EndEvent', name: 'End' },
        ],
      }),
    );
    expect(fromNeighbor).toEqual({ name: 'Validate customer?', reason: 'XOR split is a question' });

    const placeholder = suggestName(
      ctx({
        id: 'ExclusiveGateway_1',
        type: 'exclusiveGateway',
        name: 'Gateway_17',
        incoming: [{ id: 'T1', type: 'task', name: 'Task' }],
        outgoing: [
          { id: 'A', type: 'task', name: '' },
          { id: 'B', type: 'task', name: '' },
        ],
      }),
    );
    expect(placeholder?.name).toBe('Validate customer?');
  });

  it('proposes object+action for a placeholder task and a style finding', () => {
    const placeholder = suggestName(
      ctx({
        id: 'Activity_1',
        type: 'bpmn:Task',
        name: 'Task',
        incoming: [{ id: 'StartEvent_1', type: 'bpmn:StartEvent', name: 'Start' }],
        outgoing: [{ id: 'EndEvent_1', type: 'bpmn:EndEvent', name: 'End' }],
      }),
    );
    expect(placeholder).toEqual({ name: 'Validate customer', reason: 'Task names are object + action' });

    const fromFinding = suggestName(
      ctx({
        id: 'T1',
        type: 'bpmn:Task',
        name: 'Customer record',
      }),
      [{ id: 'style.task-verb', layer: 3, severity: 'style', message: 'Task “Invoice” should start with a verb', elementId: 'T1' }],
    );
    expect(fromFinding?.name).toBe('Check customer record');
  });

  it('recognises common verbs without accepting noun prefixes', () => {
    expect(hasActionVerb('Ship order')).toBe(true);
    expect(hasActionVerb('Signed contract')).toBe(true);
    expect(hasActionVerb('Checkout counter')).toBe(false);
    expect(hasActionVerb('Sender details')).toBe(false);
    expect(hasActionVerb('Reviewer meeting')).toBe(false);
    expect(hasActionVerb('Customer submits a request')).toBe(false);
    expect(shouldCheckActionVerb('Проверить документы')).toBe(false);
  });

  it('clears join/parallel labels and answers XOR flows', () => {
    const parallel = suggestName(
      ctx({
        id: 'Gateway_2',
        type: 'bpmn:ParallelGateway',
        name: 'Gateway_2',
        incoming: [{ id: 'T1', type: 'bpmn:Task', name: 'Validate customer' }],
        outgoing: [
          { id: 'A', type: 'bpmn:Task', name: 'A' },
          { id: 'B', type: 'bpmn:Task', name: 'B' },
        ],
      }),
    );
    expect(parallel).toEqual({ name: '', reason: 'Join and parallel gateways stay unlabeled' });

    const yes = suggestName(
      ctx({
        id: 'Flow_1',
        type: 'bpmn:SequenceFlow',
        name: '',
        source: { id: 'Gateway_17', type: 'bpmn:ExclusiveGateway', name: 'Validate customer?' },
        target: { id: 'A', type: 'bpmn:Task', name: 'Notify customer' },
        sourceOutgoingCount: 2,
        flowIndex: 0,
      }),
    );
    expect(yes).toEqual({ name: 'Yes', reason: 'XOR flows are answers' });
  });
});
