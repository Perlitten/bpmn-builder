import {
  addTask,
  createProcess,
  outgoingFlows,
  splitExclusive,
  type Process,
} from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { completedCount, createTokenSimulation, resolveClick } from './simulate.js';

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
});
