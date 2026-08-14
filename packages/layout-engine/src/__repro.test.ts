import { addLane, addTask, assignLane, createProcess, splitExclusive } from '@bpmn/semantic-core';
import { describe, it } from 'vitest';
import { layoutProcess } from './layout.js';

describe('repro', () => {
  it('three lanes', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Activity_1' }).process;
    p = addLane(p, { name: 'Requester' }).process;
    p = addLane(p, { name: 'Manager' }).process;
    p = addLane(p, { name: 'Finance' }).process;
    p = addTask(p, { name: 'Task_1' }).process;
    const manager = p.lanes[1]!.id;
    p = assignLane(p, p.nodes.find((n) => n.name === 'Task_1')!.id, manager).process;

    const di = layoutProcess(p);
    const label = (id: string) =>
      p.nodes.find((n) => n.id === id)?.name ??
      p.lanes.find((l) => l.id === id)?.name ??
      p.participants.find((x) => x.id === id)?.name ??
      id;
    for (const [id, b] of Object.entries(di.shapes)) {
      console.log(
        `${id.padEnd(16)} ${String(label(id)).padEnd(12)} y=${b.y}..${b.y + b.height} x=${b.x}..${b.x + b.width} h=${b.height}`,
      );
    }
    console.log('lanes', JSON.stringify(p.lanes.map((l) => ({ name: l.name, nodeIds: l.nodeIds }))));
  });

  it('xor labels', () => {
    let q = createProcess();
    q = addTask(q, { name: 'A' }).process;
    q = splitExclusive(q, { after: q.nodes.find((n) => n.name === 'A')!.id }).process;
    const di = layoutProcess(q);
    console.log('labels', JSON.stringify(di.labels, null, 1));
    console.log('flows', JSON.stringify(q.flows.map((f) => ({ id: f.id, name: f.name, s: f.source, t: f.target }))));
    console.log('shapes', JSON.stringify(di.shapes, null, 1));
  });
});
