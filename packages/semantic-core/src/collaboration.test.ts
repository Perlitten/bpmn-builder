import { describe, expect, it } from 'vitest';
import {
  addLane,
  addTask,
  createFromComponent,
  createProcess,
  moveAfter,
  removeElement,
  renameElement,
  wrapInSubprocess,
} from './index.js';

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
