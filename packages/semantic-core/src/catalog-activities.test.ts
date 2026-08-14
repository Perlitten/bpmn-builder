import { describe, expect, it } from 'vitest';
import {
  createFromComponent,
  createProcess,
  getNode,
  innerScope,
  setCalledElement,
  type Process,
} from './index.js';

function named(p: Process, name: string): string {
  const node = p.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named ${name}`);
  return node.id;
}

describe('catalog activities (slice 3)', () => {
  it('creates a transaction with an inner start/end', () => {
    const created = createFromComponent(createProcess(), 'activity.transaction', { after: 'StartEvent_1' });
    const p = created.process;
    const node = getNode(p, created.id);
    expect(node.type).toBe('subProcess');
    expect(node.bpmnType).toBe('bpmn:Transaction');
    expect(innerScope(p, created.id)?.nodeIds).toHaveLength(2);
    expect(p.regions[0]!.type).toBe('subprocess');
  });

  it('creates an ad-hoc subprocess as a container, not a task fake', () => {
    const created = createFromComponent(createProcess(), 'activity.adHocSubProcess', { after: 'StartEvent_1' });
    const node = getNode(created.process, created.id);
    expect(node.type).toBe('subProcess');
    expect(node.bpmnType).toBe('bpmn:AdHocSubProcess');
    expect(innerScope(created.process, created.id)?.nodeIds.length).toBeGreaterThan(0);
  });

  it('sets calledElement on a call activity', () => {
    let p = createFromComponent(createProcess(), 'activity.callActivity', {
      after: 'StartEvent_1',
      name: 'Pay',
      calledElement: 'PaymentProc',
    }).process;
    const id = named(p, 'Pay');
    expect(getNode(p, id).bpmnType).toBe('bpmn:CallActivity');
    expect(getNode(p, id).calledElement).toBe('PaymentProc');
    p = setCalledElement(p, id, 'RefundProc').process;
    expect(getNode(p, id).calledElement).toBe('RefundProc');
    p = setCalledElement(p, id, '').process;
    expect(getNode(p, id).calledElement).toBeUndefined();
  });
});
