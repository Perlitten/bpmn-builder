import { addLane, addTask, assignLane, attachBoundaryTimer, createProcess, happyPathIds, moveAfter, splitExclusive } from '@bpmn/semantic-core';
import { layoutProcess } from '@bpmn/layout-engine';
import { describe, expect, it } from 'vitest';
import { dropSlot } from './dropSlot';

function twoLaneTasks() {
  let p = createProcess();
  p = addTask(p, { name: 'A' }).process;
  p = addTask(p, { name: 'B' }).process;
  p = addLane(p, { name: 'Clerk' }).process;
  p = addLane(p, { name: 'Manager' }).process;
  const b = p.nodes.find((n) => n.name === 'B')!;
  p = assignLane(p, b.id, p.lanes[1]!.id).process;
  return p;
}

describe('dropSlot', () => {
  it('maps a leftward drop to moveAfter on the linear happy path', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = addTask(p, { name: 'B' }).process;
    p = addTask(p, { name: 'C' }).process;
    const a = p.nodes.find((n) => n.name === 'A')!;
    const c = p.nodes.find((n) => n.name === 'C')!;
    const box = layoutProcess(p).shapes[a.id]!;
    const slot = dropSlot(p, c.id, { x: box.x + box.width + 10, y: box.y + box.height / 2 });
    expect(slot).toEqual({ afterId: a.id });
  });

  it('maps a drop onto the other XOR band to moveToBranch', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'A')!.id }).process;
    const yes = p.regions[0]!.branches[0]!;
    const no = p.regions[0]!.branches[1]!;
    p = addTask(p, { name: 'Yes', branchId: yes.id }).process;
    p = addTask(p, { name: 'No', branchId: no.id }).process;
    const yesTask = p.nodes.find((n) => n.name === 'Yes')!;
    const noTask = p.nodes.find((n) => n.name === 'No')!;
    const box = layoutProcess(p).shapes[noTask.id]!;
    const slot = dropSlot(p, yesTask.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(slot?.branchId).toBe(no.id);
    expect(slot?.afterId).toBe(p.regions[0]!.split);
  });

  it('does not map a gateway drop to a semantic slot', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'A')!.id }).process;
    const split = p.regions[0]!.split;
    const box = layoutProcess(p).shapes[split]!;
    expect(dropSlot(p, split, { x: box.x + 200, y: box.y })).toBeNull();
  });

  it('maps a drop onto a lane body to assignLane', () => {
    const p = twoLaneTasks();
    const a = p.nodes.find((n) => n.name === 'A')!;
    const manager = p.lanes[1]!;
    const box = layoutProcess(p).shapes[manager.id]!;
    const slot = dropSlot(p, a.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(slot?.laneId).toBe(manager.id);
  });

  it('maps a drop onto a node in another lane to moveAfter plus assignLane', () => {
    const p = twoLaneTasks();
    const a = p.nodes.find((n) => n.name === 'A')!;
    const b = p.nodes.find((n) => n.name === 'B')!;
    const box = layoutProcess(p).shapes[b.id]!;
    const slot = dropSlot(p, a.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(slot?.laneId).toBe(p.lanes[1]!.id);
    expect(slot?.afterId).toBeTruthy();
    expect(slot?.afterId).not.toBe(a.id);
  });

  it('does not assign a boundary event to a lane on drop', () => {
    let p = twoLaneTasks();
    const a = p.nodes.find((n) => n.name === 'A')!;
    p = attachBoundaryTimer(p, { on: a.id }).process;
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    const manager = p.lanes[1]!;
    const box = layoutProcess(p).shapes[manager.id]!;
    expect(dropSlot(p, boundary.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBeNull();
  });

  it('maps a gateway drop onto a lane to assignLane only', () => {
    let p = twoLaneTasks();
    const a = p.nodes.find((n) => n.name === 'A')!;
    p = splitExclusive(p, { after: a.id }).process;
    const split = p.regions[0]!.split;
    const manager = p.lanes[1]!;
    const box = layoutProcess(p).shapes[manager.id]!;
    expect(dropSlot(p, split, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toEqual({
      laneId: manager.id,
    });
  });
});

describe('drop then moveAfter', () => {
  it('reorders A→B→C to A→C→B', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = addTask(p, { name: 'B' }).process;
    p = addTask(p, { name: 'C' }).process;
    const named = (name: string) => p.nodes.find((n) => n.name === name)!;
    const a = named('A');
    const c = named('C');
    const box = layoutProcess(p).shapes[a.id]!;
    const slot = dropSlot(p, c.id, { x: box.x + box.width + 10, y: box.y + box.height / 2 })!;
    expect(slot.afterId).toBeTruthy();
    p = moveAfter(p, c.id, slot.afterId!, slot.branchId).process;
    const names = happyPathIds(p).map((id) => p.nodes.find((n) => n.id === id)!.name);
    expect(names).toEqual(['Start', 'A', 'C', 'B', 'End']);
  });
});
