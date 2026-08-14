import { describe, expect, it } from 'vitest';
import {
  addTask,
  createFromComponent,
  createProcess,
  getNode,
  happyPathIds,
  type Process,
} from './index.js';

function named(p: Process, name: string): string {
  const node = p.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named ${name}`);
  return node.id;
}

describe('catalog events (slice 1)', () => {
  it('attaches an error boundary with an exception path', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Charge' }).process;
    const created = createFromComponent(p, 'boundary.error', { after: named(p, 'Charge'), name: 'Card declined' });
    p = created.process;
    const boundary = getNode(p, created.id);
    expect(boundary.type).toBe('boundaryEvent');
    expect(boundary.eventDefinition).toBe('ErrorEventDefinition');
    expect(boundary.cancelActivity).toBe(true);
    expect(boundary.attachedTo).toBe(named(p, 'Charge'));
    expect(p.exceptionBranches[0]?.hostId).toBe(named(p, 'Charge'));
    expect(p.feedback[0]?.exceptionBranch).toBe(true);
  });

  it('attaches a non-interrupting timer when that id is used', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    const created = createFromComponent(p, 'boundary.timer.nonInterrupting', { after: named(p, 'Review') });
    p = created.process;
    expect(getNode(p, created.id).cancelActivity).toBe(false);
    expect(getNode(p, created.id).eventDefinition).toBe('TimerEventDefinition');
  });

  it('sets error / terminate on the happy-path end', () => {
    let p = createProcess();
    p = createFromComponent(p, 'end.error').process;
    expect(getNode(p, 'EndEvent_1').eventDefinition).toBe('ErrorEventDefinition');
    p = createFromComponent(p, 'end.terminate').process;
    expect(getNode(p, 'EndEvent_1').eventDefinition).toBe('TerminateEventDefinition');
  });

  it('inserts intermediate catch events on the sequence', () => {
    let p = createProcess();
    const timer = createFromComponent(p, 'intermediate.catch.timer', { after: 'StartEvent_1', name: 'Wait' });
    p = timer.process;
    expect(getNode(p, timer.id)).toMatchObject({
      type: 'intermediateCatch',
      eventDefinition: 'TimerEventDefinition',
      bpmnType: 'bpmn:IntermediateCatchEvent',
    });
    expect(happyPathIds(p).map((id) => getNode(p, id).name)).toEqual(['Start', 'Wait', 'End']);

    const msg = createFromComponent(p, 'intermediate.catch.message', { after: timer.id });
    p = msg.process;
    expect(getNode(p, msg.id).eventDefinition).toBe('MessageEventDefinition');

    const cond = createFromComponent(p, 'intermediate.catch.conditional', { after: msg.id });
    expect(getNode(cond.process, cond.id).eventDefinition).toBe('ConditionalEventDefinition');
  });

  it('reuses the start event-definition path for message and timer starts', () => {
    let p = createProcess();
    p = createFromComponent(p, 'start.message').process;
    expect(getNode(p, 'StartEvent_1').eventDefinition).toBe('MessageEventDefinition');
    p = createFromComponent(p, 'start.timer').process;
    expect(getNode(p, 'StartEvent_1').eventDefinition).toBe('TimerEventDefinition');
    p = createFromComponent(p, 'start.conditional').process;
    expect(getNode(p, 'StartEvent_1').eventDefinition).toBe('ConditionalEventDefinition');
  });

  it('does not invent compensation or link events', () => {
    const p = createProcess();
    expect(() => createFromComponent(p, 'boundary.compensation')).toThrow(/no semantic create op/);
    expect(() => createFromComponent(p, 'intermediate.catch.link')).toThrow(/no semantic create op/);
    expect(() => createFromComponent(p, 'end.cancel')).toThrow(/no semantic create op/);
  });
});
