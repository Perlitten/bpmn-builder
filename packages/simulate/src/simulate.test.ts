import {
  addSubProcess,
  addTask,
  attachBoundaryTimer,
  createEventSubprocess,
  createProcess,
  incomingFlows,
  innerScope,
  outgoingFlows,
  splitExclusive,
  wrapInSubprocess,
  type Process,
} from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import {
  completedCount,
  createTokenSimulation,
  describeSimulation,
  describeSimulationError,
  resolveClick,
  simulationMarks,
} from './simulate.js';

function twoStartJoin(type: 'exclusiveGateway' | 'parallelGateway'): Process {
  return {
    id: 'Process_1',
    name: 'join',
    rootScopeId: 'Scope_1',
    idSeq: {},
    scopes: [
      {
        id: 'Scope_1',
        parentId: null,
        ownerId: null,
        nodeIds: ['StartA', 'StartB', 'Join', 'End'],
        flowIds: ['f1', 'f2', 'f3'],
      },
    ],
    nodes: [
      { id: 'StartA', type: 'start', name: 'A' },
      { id: 'StartB', type: 'start', name: 'B' },
      { id: 'Join', type, name: 'Join' },
      { id: 'End', type: 'end', name: 'End' },
    ],
    flows: [
      { id: 'f1', source: 'StartA', target: 'Join' },
      { id: 'f2', source: 'StartB', target: 'Join' },
      { id: 'f3', source: 'Join', target: 'End' },
    ],
    regions: [],
    unstructured: [],
    feedback: [],
    exceptionBranches: [],
    participants: [],
    lanes: [],
    messageFlows: [],
    processes: [],
  };
}

describe('token simulation', () => {
  it('XOR join passes each incoming token independently', () => {
    const sim = createTokenSimulation(twoStartJoin('exclusiveGateway'));
    const afterA = sim.signal('StartA');
    expect(completedCount(afterA)).toBe(1);
    expect(afterA.completed.End).toBe(1);
    expect(afterA.joinWait).toEqual({});
    const afterB = sim.signal('StartB');
    expect(completedCount(afterB)).toBe(2);
    expect(afterB.completed.End).toBe(2);
  });

  it('parallel join waits for all incoming tokens', () => {
    const sim = createTokenSimulation(twoStartJoin('parallelGateway'));
    const afterA = sim.signal('StartA');
    expect(completedCount(afterA)).toBe(0);
    expect(afterA.joinWait.Join).toEqual({ f1: 1 });
    const afterB = sim.signal('StartB');
    expect(completedCount(afterB)).toBe(1);
    expect(afterB.completed.End).toBe(1);
    expect(afterB.joinWait).toEqual({});
  });

  it('passes through an intermediate throw event without parking a token', () => {
    let p = addTask(createProcess(), { name: 'Notify' }).process;
    p = {
      ...p,
      nodes: p.nodes.map((node) => node.name === 'Notify'
        ? { ...node, type: 'intermediateThrow', bpmnType: 'bpmn:IntermediateThrowEvent' }
        : node),
    };
    const sim = createTokenSimulation(p);

    const result = sim.signal('StartEvent_1');

    expect(result.tokens).toEqual({});
    expect(result.completed.EndEvent_1).toBe(1);
  });

  it('enters a normal subprocess and resumes the parent flow after its inner end', () => {
    let p = addTask(createProcess(), { name: 'Review' }).process;
    const reviewId = p.nodes.find((node) => node.name === 'Review')!.id;
    p = wrapInSubprocess(p, [reviewId], { name: 'Review subprocess' }).process;
    const sim = createTokenSimulation(p);

    const inside = sim.signal('StartEvent_1');
    expect(inside.tokens[reviewId]).toBe(1);
    expect(completedCount(inside)).toBe(0);

    const done = sim.signal(reviewId);
    expect(done.tokens).toEqual({});
    expect(done.completed.EndEvent_1).toBe(1);
  });

  it('exclusive split takes one branch', () => {
    let p = createProcess();
    p = splitExclusive(p, { after: 'StartEvent_1' }).process;
    const region = p.regions[0];
    p = addTask(p, { name: 'Yes', branchId: region.branches[0].id }).process;
    p = addTask(p, { name: 'No', branchId: region.branches[1].id }).process;
    const yes = p.nodes.find((n) => n.name === 'Yes')!.id;
    const no = p.nodes.find((n) => n.name === 'No')!.id;
    const yesFlow = outgoingFlows(p, region.split).find((f) => f.target === yes)!;

    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    expect(sim.snapshot().tokens[region.split]).toBe(1);
    expect(sim.snapshot().tokens[yes]).toBeUndefined();
    expect(sim.snapshot().tokens[no]).toBeUndefined();
    expect(() => sim.signal(region.split)).toThrow(/outgoing sequence flow/);

    const afterChoice = sim.signal(region.split, yesFlow.id);
    expect(afterChoice.tokens[yes]).toBe(1);
    expect(afterChoice.tokens[no]).toBeUndefined();
    expect(completedCount(afterChoice)).toBe(0);

    const done = sim.signal(yes);
    expect(completedCount(done)).toBe(1);
    expect(done.tokens[no]).toBeUndefined();
  });

  it('resolveClick sends XOR choice through the sequence flow', () => {
    let p = createProcess();
    p = splitExclusive(p, { after: 'StartEvent_1' }).process;
    const split = p.regions[0].split;
    const flow = outgoingFlows(p, split)[0];
    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    expect(resolveClick(p, sim.snapshot(), split)).toBeNull();
    expect(resolveClick(p, sim.snapshot(), flow.id)).toEqual({ nodeId: split, flowId: flow.id });
  });

  it('caps drain on a two-gateway cycle', () => {
    const p: Process = {
      ...twoStartJoin('exclusiveGateway'),
      nodes: [
        { id: 'StartA', type: 'start', name: 'A' },
        { id: 'G1', type: 'exclusiveGateway', name: 'G1' },
        { id: 'G2', type: 'exclusiveGateway', name: 'G2' },
      ],
      flows: [
        { id: 'f1', source: 'StartA', target: 'G1' },
        { id: 'f2', source: 'G1', target: 'G2' },
        { id: 'f3', source: 'G2', target: 'G1' },
      ],
      scopes: [
        {
          id: 'Scope_1',
          parentId: null,
          ownerId: null,
          nodeIds: ['StartA', 'G1', 'G2'],
          flowIds: ['f1', 'f2', 'f3'],
        },
      ],
    };
    const sim = createTokenSimulation(p);
    expect(() => sim.signal('StartA')).toThrow(/step limit/);
  });
});

describe('describeSimulation', () => {
  it('names the XOR and tells the user to click a sequence flow', () => {
    let p = createProcess();
    p = splitExclusive(p, { after: 'StartEvent_1' }).process;
    p = addTask(p, { name: 'Yes', branchId: p.regions[0].branches[0].id }).process;
    p = addTask(p, { name: 'No', branchId: p.regions[0].branches[1].id }).process;
    const split = p.regions[0].split;
    p = { ...p, nodes: p.nodes.map((n) => (n.id === split ? { ...n, name: 'Review' } : n)) };
    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    expect(describeSimulation(p, sim.snapshot())).toBe(
      'Token on Review — click a sequence flow to choose XOR branch',
    );
  });

  it('describes AND join wait with arrived incoming count', () => {
    const p = twoStartJoin('parallelGateway');
    const sim = createTokenSimulation(p);
    sim.signal('StartA');
    expect(describeSimulation(p, sim.snapshot())).toBe('Waiting at AND join · Join (1/2 incoming)');
  });

  it('asks to click a start event before any token', () => {
    const p = createProcess();
    expect(describeSimulation(p, createTokenSimulation(p).snapshot())).toBe(
      'Click a start event to place a token',
    );
  });

  it('maps cycle cap to a reset hint', () => {
    expect(describeSimulationError(new Error('simulation exceeded step limit'))).toMatch(/Reset tokens/);
  });

  it('offers the boundary and event subprocess from a token on the host', () => {
    const p = assessWithTimeoutAndEscalation();
    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    expect(describeSimulation(p, sim.snapshot())).toBe(
      'Token on Assess — click the element to advance, or After 48h for the exception path, or Escalation handler as a side event',
    );
  });
});

function assessWithTimeoutAndEscalation(): Process {
  let p = createProcess();
  p = addSubProcess(p, { name: 'Assess', id: 'Sub_Assess' }).process;
  p = attachBoundaryTimer(p, { on: 'Sub_Assess', name: 'After 48h' }).process;
  p = createEventSubprocess(p, { name: 'Escalation handler', id: 'EvSub_Escalation' }).process;
  return p;
}

describe('boundary events and event subprocesses', () => {
  it('fires an attached boundary without incoming sequence flow and cancels the host', () => {
    const p = assessWithTimeoutAndEscalation();
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    const timedOut = p.exceptionBranches[0]!.nodeIds[0]!;
    expect(incomingFlows(p, boundary.id)).toHaveLength(0);

    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    expect(sim.snapshot().tokens.Sub_Assess).toBe(1);
    expect(resolveClick(p, sim.snapshot(), boundary.id)).toEqual({ nodeId: boundary.id });

    const after = sim.signal(boundary.id);
    expect(after.tokens.Sub_Assess).toBeUndefined();
    expect(after.completed[timedOut]).toBe(1);
    expect(() => sim.signal('Sub_Assess')).toThrow(/no token at/);
  });

  it('takes the happy path from the host without firing the boundary', () => {
    const p = assessWithTimeoutAndEscalation();
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    const done = sim.signal('Sub_Assess');
    expect(done.completed.EndEvent_1).toBe(1);
    expect(resolveClick(p, done, boundary.id)).toBeNull();
  });

  it('keeps the host token on a non-interrupting boundary', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review', id: 'Task_Review' }).process;
    p = attachBoundaryTimer(p, { on: 'Task_Review', name: 'Nudge', interrupting: false }).process;
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    expect(boundary.cancelActivity).toBe(false);
    const nudgeEnd = p.exceptionBranches[0]!.nodeIds[0]!;

    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    const after = sim.signal(boundary.id);
    expect(after.tokens.Task_Review).toBe(1);
    expect(after.completed[nudgeEnd]).toBe(1);
  });

  it('clicks the exception sequence flow like an XOR branch', () => {
    const p = assessWithTimeoutAndEscalation();
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    const flow = outgoingFlows(p, boundary.id)[0]!;
    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    expect(resolveClick(p, sim.snapshot(), flow.id)).toEqual({ nodeId: boundary.id, flowId: flow.id });
    const after = sim.signal(boundary.id, flow.id);
    expect(completedCount(after)).toBe(1);
  });

  it('starts an event subprocess as a side token without a parent sequence flow', () => {
    const p = assessWithTimeoutAndEscalation();
    const inner = innerScope(p, 'EvSub_Escalation')!;
    const evStart = p.nodes.find((n) => inner.nodeIds.includes(n.id) && n.type === 'start')!;
    const evEnd = p.nodes.find((n) => inner.nodeIds.includes(n.id) && n.type === 'end')!;
    expect(p.flows.some((f) => f.source === 'EvSub_Escalation' || f.target === 'EvSub_Escalation')).toBe(false);

    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    expect(resolveClick(p, sim.snapshot(), 'EvSub_Escalation')).toEqual({ nodeId: evStart.id });

    const after = sim.signal('EvSub_Escalation');
    expect(after.tokens.Sub_Assess).toBe(1);
    expect(after.completed[evEnd.id]).toBe(1);
    expect(after.completed.EndEvent_1).toBeUndefined();
  });

  it('triggers the event subprocess with no token on the parent happy path', () => {
    const p = assessWithTimeoutAndEscalation();
    const inner = innerScope(p, 'EvSub_Escalation')!;
    const evEnd = p.nodes.find((n) => inner.nodeIds.includes(n.id) && n.type === 'end')!;
    const after = createTokenSimulation(p).signal('EvSub_Escalation');
    expect(after.tokens.Sub_Assess).toBeUndefined();
    expect(after.completed[evEnd.id]).toBe(1);
    expect(after.completed.EndEvent_1).toBeUndefined();
  });

  it('highlights the attached host and event subprocess while the host is active', () => {
    const p = assessWithTimeoutAndEscalation();
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    const inner = innerScope(p, 'EvSub_Escalation')!;
    const evStart = p.nodes.find((n) => inner.nodeIds.includes(n.id) && n.type === 'start')!;
    const sim = createTokenSimulation(p);
    sim.signal('StartEvent_1');
    const marks = simulationMarks(p, sim.snapshot());
    expect(marks.host).toContain('Sub_Assess');
    expect(marks.click).toEqual(expect.arrayContaining([
      'Sub_Assess',
      boundary.id,
      'EvSub_Escalation',
      evStart.id,
    ]));
  });

  it('does not fire a boundary before the host has a token', () => {
    const p = assessWithTimeoutAndEscalation();
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    const sim = createTokenSimulation(p);
    expect(resolveClick(p, sim.snapshot(), boundary.id)).toBeNull();
    expect(() => sim.signal(boundary.id)).toThrow(/no token at/);
  });
});
