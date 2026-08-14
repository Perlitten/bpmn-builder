import { describe, expect, it } from 'vitest';
import {
  addLane,
  addMessageInteraction,
  addPool,
  addTask,
  createFromComponent,
  createProcess,
  moveAfter,
  poolTargetOf,
  removeElement,
  renameElement,
  wrapInSubprocess,
} from './index.js';
import type { Process } from './index.js';

function pool(p: Process, name: string) {
  const participant = p.participants.find((item) => item.name === name);
  if (!participant) throw new Error(`no pool named ${name}`);
  return participant;
}

function graphOf(p: Process, processId: string | undefined) {
  const graph = processId === p.id ? p : p.processes.find((item) => item.id === processId);
  if (!graph) throw new Error(`no process ${processId}`);
  return graph;
}

function named(process: ReturnType<typeof createProcess>, name: string): string {
  const node = process.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`no node named ${name}`);
  return node.id;
}

describe('pool / lane mutations', () => {
  it('addLane ×3 then rename keeps three sibling names; click-only does not invent a task', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Register' }).process;
    p = addLane(p, { name: 'Lane' }).process;
    p = addLane(p, { name: 'Lane' }).process;
    p = addLane(p, { name: 'Lane' }).process;
    expect(p.participants).toHaveLength(1);
    expect(p.lanes).toHaveLength(3);
    expect(p.lanes.every((lane) => !lane.parentLaneId)).toBe(true);

    p = renameElement(p, p.lanes[0]!.id, 'Front Office').process;
    p = renameElement(p, p.lanes[1]!.id, 'Claims Adjuster').process;
    p = renameElement(p, p.lanes[2]!.id, 'Finance').process;
    const tasks = p.nodes.filter((node) => node.type === 'task');
    expect(tasks).toHaveLength(1);
    p = renameElement(p, p.lanes[1]!.id, 'Claims Adjuster').process;
    expect(p.lanes.map((lane) => lane.name)).toEqual(['Front Office', 'Claims Adjuster', 'Finance']);
    expect(p.nodes.filter((node) => node.type === 'task')).toHaveLength(1);
    expect(p.lanes[0]!.nodeIds).toEqual(
      expect.arrayContaining(['StartEvent_1', named(p, 'Register'), 'EndEvent_1']),
    );
  });

  it('Add lane after a selected lane is a sibling, not a nested childLaneSet', () => {
    let p = createProcess();
    p = createFromComponent(p, 'participant.lane', { name: 'Front Office' }).process;
    const first = p.lanes[0]!;
    p = createFromComponent(p, 'participant.lane', { after: first.id, name: 'Claims Adjuster' }).process;
    p = createFromComponent(p, 'participant.lane', { after: p.lanes[1]!.id, name: 'Finance' }).process;
    expect(p.participants).toHaveLength(1);
    expect(p.lanes.map((lane) => lane.name)).toEqual(['Front Office', 'Claims Adjuster', 'Finance']);
    expect(p.lanes.every((lane) => !lane.parentLaneId)).toBe(true);
    expect(p.lanes.every((lane) => lane.participantId === first.participantId)).toBe(true);
  });

  it('moveAfter and removeElement keep a unique flowNodeRef membership', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = addTask(p, { name: 'B' }).process;
    p = addLane(p, { name: 'Front Office' }).process;
    p = addLane(p, { name: 'Finance' }).process;
    const a = named(p, 'A');
    const b = named(p, 'B');
    p = moveAfter(p, b, 'StartEvent_1').process;
    const refs = p.lanes.flatMap((lane) => lane.nodeIds);
    expect(refs.filter((id) => id === b)).toHaveLength(1);
    expect(p.lanes[0]!.nodeIds).toContain(b);

    p = removeElement(p, a).process;
    expect(p.lanes.some((lane) => lane.nodeIds.includes(a))).toBe(false);
    expect(p.lanes).toHaveLength(2);
  });

  it('creates into the selected pool, not the host process', () => {
    let p = createProcess();
    p = addPool(p, { name: 'Supplier' }).process;
    const supplier = pool(p, 'Supplier');
    expect(poolTargetOf(p, supplier.id)).toBe(supplier.id);

    const hostNodes = p.nodes.length;
    const applied = createFromComponent(p, 'activity.userTask', { after: supplier.id, name: 'Ship goods' });
    p = applied.process;

    const peer = graphOf(p, supplier.processId);
    expect(p.nodes).toHaveLength(hostNodes);
    expect([...peer.nodes].map((node) => node.name).sort()).toEqual(['End', 'Ship goods', 'Start']);
    expect(peer.nodes.find((node) => node.id === applied.id)?.bpmnType).toBe('bpmn:UserTask');
    const start = peer.nodes.find((node) => node.type === 'start')!;
    const end = peer.nodes.find((node) => node.type === 'end')!;
    expect(peer.flows.map((flow) => [flow.source, flow.target])).toEqual([
      [start.id, applied.id],
      [applied.id, end.id],
    ]);
    expect(new Set(p.nodes.map((node) => node.id))).not.toContain(applied.id);
  });

  it('keeps creating into the same pool and splits gateways there', () => {
    let p = createProcess();
    p = addPool(p, { name: 'Supplier' }).process;
    const supplier = pool(p, 'Supplier');
    p = createFromComponent(p, 'activity.userTask', { after: supplier.id, name: 'Ship goods' }).process;
    p = createFromComponent(p, 'gateway.exclusive', { after: supplier.id, name: 'In stock?' }).process;

    const peer = graphOf(p, supplier.processId);
    expect(peer.regions).toHaveLength(1);
    expect(peer.regions[0]!.branches.map((branch) => branch.name)).toEqual(['Yes', 'No']);
    expect(p.regions).toHaveLength(0);
    const ids = [...p.nodes, ...p.processes.flatMap((graph) => graph.nodes)].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('creating in a lane of the host pool still lands in the host process', () => {
    let p = createProcess();
    p = addPool(p, { name: 'Supplier' }).process;
    p = addLane(p, { name: 'Manager' }).process;
    const lane = p.lanes[0]!;
    expect(poolTargetOf(p, lane.id)).toBe(lane.participantId);
    const applied = createFromComponent(p, 'activity.userTask', { after: lane.id, name: 'Approve' });
    expect(applied.process.nodes.some((node) => node.id === applied.id)).toBe(true);
  });

  it('renaming a participant renames the process it references', () => {
    let p = createProcess();
    p = addPool(p, { name: 'Pool' }).process;
    const partner = pool(p, 'Pool');
    const host = p.participants.find((item) => item.processId === p.id)!;

    p = renameElement(p, partner.id, 'Supplier').process;
    expect(graphOf(p, partner.processId).name).toBe('Supplier');
    expect(p.participants.find((item) => item.id === partner.id)?.name).toBe('Supplier');

    p = renameElement(p, host.id, 'Acme Corp').process;
    expect(p.name).toBe('Acme Corp');
  });

  it('connects two filled pools with a message flow', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Order goods' }).process;
    p = addPool(p, { name: 'Supplier' }).process;
    const supplier = pool(p, 'Supplier');
    const host = p.participants.find((item) => item.processId === p.id)!;
    p = createFromComponent(p, 'activity.userTask', { after: supplier.id, name: 'Ship goods' }).process;

    p = createFromComponent(p, 'flow.message', { after: host.id, name: 'Order' }).process;
    expect(p.messageFlows).toHaveLength(1);
    expect(p.messageFlows[0]).toMatchObject({ source: host.id, target: supplier.id, name: 'Order' });

    const from = p.nodes.find((node) => node.name === 'Order goods')!;
    const to = graphOf(p, supplier.processId).nodes.find((node) => node.name === 'Ship goods')!;
    p = addMessageInteraction(p, { from: from.id, to: to.id, name: 'Purchase order' }).process;
    expect(p.messageFlows).toHaveLength(2);
    expect(p.messageFlows[1]).toMatchObject({ source: from.id, target: to.id });
  });

  it('first lane does not claim subprocess inner nodes as flowNodeRef', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = wrapInSubprocess(p, [named(p, 'A')], { name: 'Assess' }).process;
    const inner = p.nodes.find((node) => node.name === 'A')!;
    p = addLane(p, { name: 'Adjuster' }).process;
    expect(p.lanes[0]!.nodeIds).not.toContain(inner.id);
    expect(p.lanes[0]!.nodeIds).toContain(p.nodes.find((node) => node.type === 'subProcess')!.id);
  });
});
