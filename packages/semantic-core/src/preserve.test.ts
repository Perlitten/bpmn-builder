import { describe, expect, it } from 'vitest';
import { attachBoundaryTimer, createFromComponent, createProcess, getNode } from './index.js';
import {
  findFlowNode,
  readDocumentation,
  readMultiInstance,
  readPreserveAttr,
  readTimerDuration,
  setDocumentation,
  setIsExecutable,
  setMultiInstance,
  setPreserveAttr,
  setTimerDuration,
} from './preserve.js';

describe('preserved BPMN field ops', () => {
  it('sets documentation on a node and on the process', () => {
    let p = createProcess();
    p = setDocumentation(p, 'StartEvent_1', 'Kick-off').process;
    expect(readDocumentation(getNode(p, 'StartEvent_1'))).toBe('Kick-off');
    expect(getNode(p, 'StartEvent_1').bpmnPreserve?.props?.documentation).toEqual([
      { $type: 'bpmn:Documentation', $body: 'Kick-off' },
    ]);
    p = setDocumentation(p, p.id, 'Claims handling process.').process;
    expect(readDocumentation(p)).toBe('Claims handling process.');
    p = setDocumentation(p, 'StartEvent_1', '').process;
    expect(getNode(p, 'StartEvent_1').bpmnPreserve).toBeUndefined();
  });

  it('sets isExecutable on the process', () => {
    let p = createProcess();
    expect(p.isExecutable).toBeUndefined();
    p = setIsExecutable(p, true).process;
    expect(p.isExecutable).toBe(true);
    p = setIsExecutable(p, false).process;
    expect(p.isExecutable).toBe(false);
  });

  it('writes timeDuration onto a timer event definition', () => {
    let p = createFromComponent(createProcess(), 'activity.task', { after: 'StartEvent_1', name: 'Work' }).process;
    const host = p.nodes.find((n) => n.name === 'Work')!;
    p = attachBoundaryTimer(p, { on: host.id }).process;
    const timer = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    expect(timer.eventDefinition).toBe('TimerEventDefinition');
    p = setTimerDuration(p, timer.id, 'PT48H').process;
    expect(readTimerDuration(getNode(p, timer.id))).toBe('PT48H');
    const defs = getNode(p, timer.id).bpmnPreserve?.props?.eventDefinitions as Array<{ timeDuration?: { $body?: string } }>;
    expect(defs[0]?.timeDuration?.$body).toBe('PT48H');
    p = setTimerDuration(p, timer.id, 'P5D').process;
    expect(readTimerDuration(getNode(p, timer.id))).toBe('P5D');
  });

  it('refuses timer duration on a non-timer event', () => {
    expect(() => setTimerDuration(createProcess(), 'EndEvent_1', 'P1D')).toThrow(/timer duration/);
  });

  it('sets Camunda attrs and script body on bpmnPreserve.attrs', () => {
    let p = createFromComponent(createProcess(), 'activity.serviceTask', { after: 'StartEvent_1' }).process;
    const task = p.nodes.find((n) => n.bpmnType === 'bpmn:ServiceTask')!;
    p = setPreserveAttr(p, task.id, 'camunda:topic', 'claim-intake').process;
    expect(readPreserveAttr(findFlowNode(p, task.id), 'camunda:topic')).toBe('claim-intake');
    p = setPreserveAttr(p, task.id, 'camunda:topic', '').process;
    expect(findFlowNode(p, task.id)?.bpmnPreserve).toBeUndefined();
  });

  it('sets multi-instance sequential and cardinality without dropping extras', () => {
    let p = createFromComponent(createProcess(), 'activity.task', { after: 'StartEvent_1', name: 'Verify' }).process;
    const task = p.nodes.find((n) => n.name === 'Verify')!;
    p = {
      ...p,
      nodes: p.nodes.map((n) =>
        n.id === task.id
          ? {
              ...n,
              bpmnPreserve: {
                props: {
                  loopCharacteristics: {
                    $type: 'bpmn:MultiInstanceLoopCharacteristics',
                    completionCondition: { $type: 'bpmn:Expression', $body: '${done}' },
                  },
                },
              },
            }
          : n,
      ),
    };
    p = setMultiInstance(p, task.id, { sequential: true, cardinality: '3' }).process;
    expect(readMultiInstance(getNode(p, task.id))).toEqual({ sequential: true, cardinality: '3' });
    const loop = getNode(p, task.id).bpmnPreserve?.props?.loopCharacteristics as Record<string, unknown>;
    expect(loop.completionCondition).toEqual({ $type: 'bpmn:Expression', $body: '${done}' });
    p = setMultiInstance(p, task.id, { sequential: false, cardinality: '' }).process;
    expect(getNode(p, task.id).bpmnPreserve?.props?.loopCharacteristics).toMatchObject({
      $type: 'bpmn:MultiInstanceLoopCharacteristics',
      completionCondition: { $type: 'bpmn:Expression', $body: '${done}' },
    });
    expect(readMultiInstance(getNode(p, task.id))).toEqual({ sequential: false, cardinality: '' });
  });
});
