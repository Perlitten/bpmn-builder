import { describe, expect, it } from 'vitest';
import {
  addAfter,
  addBefore,
  addBranch,
  addLane,
  addMessageInteraction,
  addPool,
  addTask,
  assignLane,
  attachBoundaryTimer,
  createFromComponent,
  createProcess,
  detectStructure,
  FEEDBACK,
  getNode,
  happyPathIds,
  moveAfter,
  moveToBranch,
  removeElement,
  renameElement,
  replaceBpmnType,
  setBranchLocked,
  splitEventBased,
  splitExclusive,
  splitInclusive,
  splitParallel,
  UNSTRUCTURED,
  wrapInSubprocess,
  createEventSubprocess,
  innerScope,
  type Process,
} from './index.js';

function named(p: Process, name: string): string {
  const node = p.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named ${name}`);
  return node.id;
}

function pathNames(p: Process): string[] {
  return happyPathIds(p).map((id) => getNode(p, id).name);
}

describe('semantic-core', () => {
  it('builds a linear A→B→C chain with stable ids', () => {
    let p = createProcess({ name: 'Linear' });
    expect(p.nodes.map((n) => n.id)).toEqual(['StartEvent_1', 'EndEvent_1']);
    p = addTask(p, { name: 'A' }).process;
    p = addTask(p, { name: 'B' }).process;
    p = addTask(p, { name: 'C' }).process;
    expect(pathNames(p)).toEqual(['Start', 'A', 'B', 'C', 'End']);
    expect(named(p, 'A')).toBe('Task_1');
    expect(named(p, 'B')).toBe('Task_2');
    expect(named(p, 'C')).toBe('Task_3');
    expect(p.regions).toEqual([]);
    expect(p.unstructured).toEqual([]);
  });

  it('splitExclusive creates a symmetric XOR region with join', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    const split = splitExclusive(p, {
      after: named(p, 'A'),
      name: 'Approved?',
      branches: [{ name: 'Yes' }, { name: 'No' }],
    });
    p = split.process;
    expect(p.regions).toHaveLength(1);
    const region = p.regions[0];
    expect(split.id).toBe(region.id);
    expect(getNode(p, region.split).type).toBe('exclusiveGateway');
    expect(getNode(p, region.join).type).toBe('exclusiveGateway');
    expect(region.split).not.toBe(region.join);
    expect(region.branches.map((b) => b.name)).toEqual(['Yes', 'No']);
    expect(region.branches[0].nodeIds).toHaveLength(0);
    expect(region.branches[1].nodeIds).toHaveLength(0);

    p = addTask(p, { name: 'B', branchId: region.branches[0].id }).process;
    p = addTask(p, { name: 'D', branchId: region.branches[1].id }).process;
    const xor = p.regions[0];
    expect(xor.branches.map((b) => b.nodeIds.map((id) => getNode(p, id).name))).toEqual([['B'], ['D']]);
    expect(xor.branches[0].nodeIds).toHaveLength(xor.branches[1].nodeIds.length);
    expect(detectStructure(p).regions[0].id).toBe(xor.id);
  });

  it('moveAfter reorders a linear chain', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = addTask(p, { name: 'B' }).process;
    p = addTask(p, { name: 'C' }).process;
    p = moveAfter(p, named(p, 'C'), named(p, 'A')).process;
    expect(pathNames(p)).toEqual(['Start', 'A', 'C', 'B', 'End']);
    expect(named(p, 'A')).toBe('Task_1');
    expect(named(p, 'C')).toBe('Task_3');
  });

  it('adding a task to one XOR branch does not reorder the other', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: named(p, 'A') }).process;
    const yes = p.regions[0].branches[0].id;
    const no = p.regions[0].branches[1].id;
    p = addTask(p, { name: 'Keep', branchId: no }).process;
    const before = {
      ids: p.regions[0].branches.map((b) => b.id),
      names: p.regions[0].branches.map((b) => b.name),
      noNodes: [...p.regions[0].branches[1].nodeIds],
      noEntry: p.regions[0].branches[1].entryFlowId,
    };
    p = addTask(p, { name: 'Extra', branchId: yes }).process;
    expect(p.regions[0].branches.map((b) => b.id)).toEqual(before.ids);
    expect(p.regions[0].branches.map((b) => b.name)).toEqual(before.names);
    expect(p.regions[0].branches[1].id).toBe(no);
    expect(p.regions[0].branches[1].nodeIds).toEqual(before.noNodes);
    expect(p.regions[0].branches[1].entryFlowId).toBe(before.noEntry);
    expect(p.regions[0].branches[0].nodeIds.map((id) => getNode(p, id).name)).toEqual(['Extra']);
  });

  it('operations are undoable', () => {
    const origin = createProcess();
    const added = addTask(origin, { name: 'A' });
    expect(added.inverse(added.process)).toEqual(origin);
    const split = splitExclusive(added.process, { after: added.id });
    expect(split.inverse(split.process)).toEqual(added.process);
  });

  it('addAfter / addBefore / rename / addBranch / moveToBranch', () => {
    let p = createProcess();
    const a = addAfter(p, 'StartEvent_1', { name: 'A' });
    p = a.process;
    p = addBefore(p, 'EndEvent_1', { name: 'C' }).process;
    p = renameElement(p, named(p, 'A'), 'Alpha').process;
    expect(pathNames(p)).toEqual(['Start', 'Alpha', 'C', 'End']);

    p = splitExclusive(p, { after: named(p, 'Alpha') }).process;
    const regionId = p.regions[0].id;
    const extra = addBranch(p, regionId, { name: 'Maybe' });
    p = extra.process;
    expect(p.regions[0].branches.map((b) => b.name)).toEqual(['Yes', 'No', 'Maybe']);
    expect(extra.id).toBe(p.regions[0].branches[2].id);

    p = moveToBranch(p, named(p, 'C'), p.regions[0].branches[0].id).process;
    expect(p.regions[0].branches[0].nodeIds.map((id) => getNode(p, id).name)).toEqual(['C']);
    expect(p.regions[0].branches[1].nodeIds).toEqual([]);
  });

  it('marks an unmatched XOR split as UNSTRUCTURED', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: named(p, 'A') }).process;
    const join = p.regions[0].join;
    p = removeElement(p, join).process;
    expect(p.regions).toEqual([]);
    expect(p.unstructured).toEqual([
      { kind: UNSTRUCTURED, gatewayId: expect.any(String), reason: 'no matching join' },
    ]);
  });

  it('createFromComponent rejects start/end/unimplemented ids', () => {
    const p = createProcess();
    expect(() => createFromComponent(p, 'start.none')).toThrow(/already has a start/i);
    expect(() => createFromComponent(p, 'end.none')).toThrow(/cannot be inserted/i);
    expect(() => createFromComponent(p, 'boundary.compensation')).toThrow(/no semantic create op/i);
    expect(() => createFromComponent(p, 'event.start.none')).toThrow(/unknown component/);
  });

  it('createFromComponent adds a typed task and XOR/AND splits via registry ids', () => {
    let p = createProcess();
    const task = createFromComponent(p, 'activity.userTask', { after: 'StartEvent_1' });
    p = task.process;
    expect(getNode(p, task.id).bpmnType).toBe('bpmn:UserTask');
    expect(pathNames(p)).toEqual(['Start', 'User Task', 'End']);

    const xor = createFromComponent(p, 'gateway.exclusive', { after: task.id });
    p = xor.process;
    expect(p.regions[0]!.type).toBe('exclusive');
  });

  it('replaceBpmnType stays in family', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    const id = named(p, 'A');
    p = replaceBpmnType(p, id, 'bpmn:ServiceTask').process;
    expect(getNode(p, id).type).toBe('task');
    expect(getNode(p, id).bpmnType).toBe('bpmn:ServiceTask');
    expect(() => replaceBpmnType(p, id, 'bpmn:ExclusiveGateway')).toThrow(/cannot replace/);
  });

  it('splitParallel creates a symmetric AND region with join', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    const split = splitParallel(p, { after: named(p, 'A') });
    p = split.process;
    expect(p.regions).toHaveLength(1);
    const region = p.regions[0]!;
    expect(split.id).toBe(region.id);
    expect(region.type).toBe('parallel');
    expect(getNode(p, region.split).type).toBe('parallelGateway');
    expect(getNode(p, region.join).type).toBe('parallelGateway');
    expect(region.split).not.toBe(region.join);

    p = addTask(p, { name: 'B', branchId: region.branches[0]!.id }).process;
    p = addTask(p, { name: 'C', branchId: region.branches[1]!.id }).process;
    const and = p.regions[0]!;
    expect(and.type).toBe('parallel');
    expect(and.branches.map((b) => b.nodeIds.map((id) => getNode(p, id).name))).toEqual([['B'], ['C']]);
    expect(detectStructure(p).regions[0]!.type).toBe('parallel');
    expect(detectStructure(p).regions[0]!.join).toBe(and.join);
  });

  it('removes an untouched split together with its join', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: named(p, 'A') }).process;
    const split = p.regions[0]!.split;
    const after = p.regions[0]!.join;
    p = removeElement(p, split).process;
    expect(p.nodes.map((node) => node.id)).not.toContain(split);
    expect(p.nodes.map((node) => node.id)).not.toContain(after);
    expect(p.flows.filter((flow) => flow.source === named(p, 'A'))).toHaveLength(1);
    expect(p.regions).toEqual([]);
  });

  it('splitParallel materialises named work arms without leaving empty branches', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Prepare' }).process;
    p = splitParallel(p, {
      after: named(p, 'Prepare'),
      branches: [{ name: 'Check budget' }, { name: 'Check legal risk' }],
    }).process;

    const region = p.regions[0]!;
    expect(region.branches.map((branch) => branch.nodeIds.map((id) => getNode(p, id).name))).toEqual([
      ['Check budget'],
      ['Check legal risk'],
    ]);
    expect(p.nodes.filter((node) => node.type === 'task').map((node) => node.name)).toEqual([
      'Prepare',
      'Check budget',
      'Check legal risk',
    ]);
    expect(p.flows.filter((flow) => flow.source === region.split)).toHaveLength(2);
    expect(p.flows.filter((flow) => flow.source === region.split).every((flow) => !flow.name)).toBe(true);
  });

  it('splitInclusive creates an OR region; splitEventBased is marked event-based with XOR join', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitInclusive(p, { after: named(p, 'A') }).process;
    expect(p.regions[0]!.type).toBe('inclusive');
    expect(getNode(p, p.regions[0]!.split).type).toBe('inclusiveGateway');
    expect(getNode(p, p.regions[0]!.join).type).toBe('inclusiveGateway');

    p = createProcess();
    p = addTask(p, { name: 'Wait' }).process;
    const split = splitEventBased(p, { after: named(p, 'Wait') });
    p = split.process;
    const region = p.regions[0]!;
    expect(region.type).toBe('eventBased');
    expect(getNode(p, region.split).type).toBe('eventBasedGateway');
    expect(getNode(p, region.join).type).toBe('exclusiveGateway');
    expect(region.branches.map((b) => b.name)).toEqual(['Message', 'Timer']);
    expect(region.branches.map((b) => b.nodeIds.map((id) => getNode(p, id).eventDefinition))).toEqual([
      ['MessageEventDefinition'],
      ['TimerEventDefinition'],
    ]);
    expect(detectStructure(p).regions[0]!.type).toBe('eventBased');

    p = createFromComponent(createProcess(), 'gateway.eventBased', { after: 'StartEvent_1' }).process;
    expect(p.regions[0]!.type).toBe('eventBased');
  });

  it('splitComplex is a real gateway region with a matching join', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    const split = createFromComponent(p, 'gateway.complex', { after: named(p, 'A') });
    p = split.process;
    expect(p.regions[0]!.type).toBe('complex');
    expect(getNode(p, p.regions[0]!.split).type).toBe('complexGateway');
    expect(getNode(p, p.regions[0]!.join).type).toBe('complexGateway');
    expect(p.regions[0]!.split).not.toBe(p.regions[0]!.join);
    expect(p.regions[0]!.branches).toHaveLength(2);
    expect(getNode(p, p.regions[0]!.split).bpmnType).toBe('bpmn:ComplexGateway');
  });

  it('attachBoundaryTimer marks an exception/feedback path on the task', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    const host = named(p, 'Review');
    const attached = attachBoundaryTimer(p, { on: host, name: 'SLA' });
    p = attached.process;
    const boundary = getNode(p, attached.id);
    expect(boundary.type).toBe('boundaryEvent');
    expect(boundary.attachedTo).toBe(host);
    expect(boundary.eventDefinition).toBe('TimerEventDefinition');
    expect(boundary.cancelActivity).toBe(true);
    expect(p.exceptionBranches).toHaveLength(1);
    expect(p.exceptionBranches[0]).toMatchObject({
      hostId: host,
      boundaryId: boundary.id,
      nodeIds: [expect.any(String)],
    });
    expect(getNode(p, p.exceptionBranches[0]!.nodeIds[0]!).type).toBe('end');
    expect(p.feedback).toEqual([
      expect.objectContaining({
        kind: FEEDBACK,
        attachedTo: host,
        exceptionBranch: true,
        reason: 'exception',
        source: boundary.id,
      }),
    ]);
    const flow = p.flows.find((f) => f.id === p.feedback[0]!.flowId);
    expect(flow?.exception).toBe(true);
    expect(pathNames(p)).toEqual(['Start', 'Review', 'End']);
    expect(attached.inverse(p)).toEqual(expect.objectContaining({ nodes: expect.any(Array) }));
    expect(attached.inverse(p).nodes.some((n) => n.id === boundary.id)).toBe(false);

    p = createFromComponent(createProcess(), 'activity.task', { after: 'StartEvent_1' }).process;
    p = createFromComponent(p, 'boundary.timer', { after: named(p, 'Task') }).process;
    expect(p.feedback[0]?.exceptionBranch).toBe(true);
    expect(p.exceptionBranches[0]?.hostId).toBe(named(p, 'Task'));
  });

  it('addPool wraps the process and adds a partner; sequence flow stays intra-process', () => {
    const origin = createProcess({ name: 'Review' });
    const added = addPool(origin, { name: 'Partner' });
    const p = added.process;
    expect(p.participants).toHaveLength(2);
    expect(p.participants[0]).toMatchObject({ name: 'Review', processId: p.id });
    expect(p.participants[1]).toMatchObject({ id: added.id, name: 'Partner' });
    expect(p.participants[1]!.processId).toBeDefined();
    expect(p.processes.some((g) => g.id === p.participants[1]!.processId && g.nodes.length === 0)).toBe(true);
    expect(p.collaborationId).toMatch(/^Collaboration_/);
    expect(p.flows.every((f) => p.nodes.some((n) => n.id === f.source) && p.nodes.some((n) => n.id === f.target))).toBe(
      true,
    );
    expect(p.messageFlows).toEqual([]);
    expect(added.inverse(p)).toEqual(origin);

    const second = addPool(p, { name: 'Audit' });
    expect(second.process.participants.map((part) => part.name)).toEqual(['Review', 'Partner', 'Audit']);
    expect(second.id).toBe(second.process.participants[2]!.id);
  });

  it('addLane / assignLane partition a pool; addMessageInteraction crosses participants', () => {
    let p = createProcess({ name: 'Clerk' });
    p = addTask(p, { name: 'Review' }).process;
    const pool = addPool(p, { name: 'Partner' });
    p = pool.process;
    const host = p.participants[0]!.id;
    const partner = p.participants[1]!.id;

    const lane = addLane(p, { participantId: host, name: 'Clerk' });
    p = lane.process;
    expect(p.lanes).toHaveLength(1);
    expect(p.lanes[0]!.nodeIds).toEqual(expect.arrayContaining(['StartEvent_1', named(p, 'Review'), 'EndEvent_1']));
    const extra = addLane(p, { participantId: host, name: 'Manager' });
    p = extra.process;
    expect(p.lanes.map((l) => l.name)).toEqual(['Clerk', 'Manager']);
    expect(p.lanes[1]!.nodeIds).toEqual([]);

    p = assignLane(p, named(p, 'Review'), extra.id).process;
    expect(p.lanes[0]!.nodeIds).not.toContain(named(p, 'Review'));
    expect(p.lanes[1]!.nodeIds).toEqual([named(p, 'Review')]);
    p = assignLane(p, named(p, 'Review'), '').process;
    expect(p.lanes.every((item) => !item.nodeIds.includes(named(p, 'Review')))).toBe(true);

    const msg = addMessageInteraction(p, { from: host, to: partner, name: 'Request' });
    p = msg.process;
    expect(p.messageFlows).toEqual([
      expect.objectContaining({ id: msg.id, source: host, target: partner, name: 'Request' }),
    ]);
    expect(p.flows.some((f) => f.id === msg.id)).toBe(false);
    expect(() => addMessageInteraction(p, { from: host, to: host })).toThrow(/cross participants/i);

    p = renameElement(p, host, 'Our org').process;
    expect(p.participants[0]!.name).toBe('Our org');

    p = createFromComponent(createProcess(), 'participant.pool', { name: 'Bank' }).process;
    expect(p.participants.map((part) => part.name)).toEqual(['Process', 'Bank']);
    p = createFromComponent(p, 'participant.lane', { after: p.participants[0]!.id, name: 'Ops' }).process;
    expect(p.lanes[0]!.name).toBe('Ops');
    const bank = p.participants[1]!.id;
    p = createFromComponent(p, 'participant.lane', { after: bank, name: 'Treasury' }).process;
    expect(p.participants).toHaveLength(2);
    expect(p.lanes.find((l) => l.name === 'Treasury')?.participantId).toBe(bank);
    p = createFromComponent(p, 'flow.message').process;
    expect(p.messageFlows).toHaveLength(1);
    expect(p.messageFlows[0]!.source).not.toBe(p.messageFlows[0]!.target);
  });

  it('Lane create wraps a host pool instead of stacking extra pools', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Task' }).process;
    p = createFromComponent(p, 'participant.lane', { name: 'Clerk' }).process;
    expect(p.participants).toHaveLength(1);
    expect(p.participants[0]!.processId).toBe(p.id);
    expect(p.lanes).toHaveLength(1);
    expect(p.lanes[0]!.name).toBe('Clerk');
    expect(p.lanes[0]!.nodeIds).toEqual(expect.arrayContaining(['StartEvent_1', named(p, 'Task'), 'EndEvent_1']));

    p = createFromComponent(p, 'participant.lane', { name: 'Manager' }).process;
    expect(p.participants).toHaveLength(1);
    expect(p.lanes.map((l) => l.name)).toEqual(['Clerk', 'Manager']);
    expect(p.lanes[1]!.nodeIds).toEqual([]);
  });

  it('setBranchLocked survives structure rebuild', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    p = splitExclusive(p, { after: named(p, 'Review') }).process;
    const yes = p.regions[0]!.branches[0]!;
    const no = p.regions[0]!.branches[1]!;
    p = setBranchLocked(p, no.id, true).process;
    expect(p.regions[0]!.branches[1]!.locked).toBe(true);

    p = addTask(p, { name: 'Handle yes', branchId: yes.id }).process;
    p = addTask(p, { name: 'Handle no', branchId: no.id }).process;
    expect(p.regions[0]!.branches[1]!.locked).toBe(true);
    expect(detectStructure(p).regions[0]!.branches[1]!.locked).toBe(true);

    p = setBranchLocked(p, no.id, false).process;
    expect(p.regions[0]!.branches[1]!.locked).toBeUndefined();
  });

  it('wrapInSubprocess moves a linear fragment into an inner scope', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = addTask(p, { name: 'B' }).process;
    const origin = p;
    const wrapped = wrapInSubprocess(p, [named(p, 'A'), named(p, 'B')], { name: 'Review' });
    p = wrapped.process;
    expect(getNode(p, wrapped.id).type).toBe('subProcess');
    expect(getNode(p, wrapped.id).bpmnType).toBe('bpmn:SubProcess');
    expect(getNode(p, wrapped.id).triggeredByEvent).toBeUndefined();
    expect(pathNames(p)).toEqual(['Start', 'Review', 'End']);
    expect(p.regions).toHaveLength(1);
    expect(p.regions[0]!.type).toBe('subprocess');
    expect(p.regions[0]!.split).toBe(wrapped.id);
    const inner = innerScope(p, wrapped.id)!;
    expect(inner.ownerId).toBe(wrapped.id);
    expect(inner.nodeIds.map((id) => getNode(p, id).name).sort()).toEqual(['A', 'B', 'End', 'Start']);
    expect(p.regions[0]!.branches[0]!.nodeIds.map((id) => getNode(p, id).name)).toEqual(['Start', 'A', 'B', 'End']);
    expect(wrapped.inverse(p)).toEqual(origin);
  });

  it('wrapInSubprocess nests an XOR region inside the subprocess', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: named(p, 'A') }).process;
    const xor = p.regions[0]!;
    p = addTask(p, { name: 'YesTask', branchId: xor.branches[0]!.id }).process;
    p = addTask(p, { name: 'NoTask', branchId: xor.branches[1]!.id }).process;
    const region = p.regions[0]!;
    const ids = [region.split, region.join, ...region.branches.flatMap((b) => b.nodeIds)];
    const xorId = region.id;
    const branchNames = region.branches.map((b) => b.name);
    p = wrapInSubprocess(p, ids, { name: 'Decide' }).process;
    expect(p.regions).toHaveLength(1);
    expect(p.regions[0]!.type).toBe('subprocess');
    expect(p.regions[0]!.nested).toHaveLength(1);
    expect(p.regions[0]!.nested[0]!.type).toBe('exclusive');
    expect(p.regions[0]!.nested[0]!.id).toBe(xorId);
    expect(p.regions[0]!.nested[0]!.branches.map((b) => b.name)).toEqual(branchNames);
    expect(p.regions[0]!.nested[0]!.branches.map((b) => b.nodeIds.map((id) => getNode(p, id).name))).toEqual([
      ['YesTask'],
      ['NoTask'],
    ]);
    expect(pathNames(p)).toEqual(['Start', 'A', 'Decide', 'End']);
  });

  it('createEventSubprocess is not on the happy path and nests under a parent subprocess', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    const origin = p;
    const added = createEventSubprocess(p, { name: 'On error' });
    p = added.process;
    expect(getNode(p, added.id).triggeredByEvent).toBe(true);
    expect(pathNames(p)).toEqual(['Start', 'A', 'End']);
    expect(p.regions.some((r) => r.type === 'eventSubprocess' && r.split === added.id)).toBe(true);
    const inner = innerScope(p, added.id)!;
    const start = p.nodes.find((n) => inner.nodeIds.includes(n.id) && n.type === 'start')!;
    expect(start.eventDefinition).toBe('MessageEventDefinition');
    expect(p.flows.some((f) => f.source === added.id || f.target === added.id)).toBe(false);
    expect(added.inverse(p)).toEqual(origin);

    p = createFromComponent(createProcess(), 'activity.subProcess', { after: 'StartEvent_1' }).process;
    const sub = p.nodes.find((n) => n.type === 'subProcess')!;
    p = createFromComponent(p, 'activity.eventSubProcess', { after: sub.id }).process;
    expect(p.regions[0]!.type).toBe('subprocess');
    expect(p.regions[0]!.nested.some((r) => r.type === 'eventSubprocess')).toBe(true);
  });

  it('createFromComponent activity.subProcess inserts an expanded subprocess', () => {
    const created = createFromComponent(createProcess(), 'activity.subProcess', { after: 'StartEvent_1' });
    const p = created.process;
    expect(getNode(p, created.id).type).toBe('subProcess');
    expect(pathNames(p)).toEqual(['Start', 'Subprocess', 'End']);
    expect(p.regions[0]!.type).toBe('subprocess');
    expect(innerScope(p, created.id)?.nodeIds).toHaveLength(2);
  });

  it('renameElement keeps opaque BPMN preservation fields', () => {
    let p = createProcess();
    p = {
      ...p,
      isExecutable: true,
      artifacts: [{ $type: 'bpmn:DataObject', id: 'DO_1', name: 'File' }],
      rootElements: [{ $type: 'bpmn:Message', id: 'Msg_1', name: 'Ping' }],
      nodes: p.nodes.map((n) =>
        n.id === 'EndEvent_1' ? { ...n, bpmnPreserve: { attrs: { calledElement: 'Pay' } } } : n,
      ),
    };
    p = renameElement(p, 'EndEvent_1', 'Done').process;
    expect(p.isExecutable).toBe(true);
    expect(p.artifacts).toEqual([{ $type: 'bpmn:DataObject', id: 'DO_1', name: 'File' }]);
    expect(p.rootElements).toEqual([{ $type: 'bpmn:Message', id: 'Msg_1', name: 'Ping' }]);
    expect(p.nodes.find((n) => n.id === 'EndEvent_1')?.name).toBe('Done');
    expect(p.nodes.find((n) => n.id === 'EndEvent_1')?.bpmnPreserve).toEqual({ attrs: { calledElement: 'Pay' } });
  });
});
