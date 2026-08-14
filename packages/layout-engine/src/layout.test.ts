import { addLane, addMessageInteraction, addPool, addTask, createEventSubprocess, createProcess, renameElement, splitExclusive, wrapInSubprocess } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { layout, layoutProcess } from './layout.js';
import { centerY, isOrthogonal } from './route.js';
import { BASELINE_CY, TOKENS } from './tokens.js';
import type { LayoutInput, LayoutResult } from './types.js';

function linear(): LayoutInput {
  return {
    nodes: [
      { id: 'start', type: 'startEvent' },
      { id: 'task', type: 'task' },
      { id: 'end', type: 'endEvent' },
    ],
    sequenceFlows: [
      { id: 'f1', source: 'start', target: 'task' },
      { id: 'f2', source: 'task', target: 'end' },
    ],
  };
}

function xor(yesIds: string[]): LayoutInput {
  const yesNodes = yesIds.map((id) => ({ id, type: 'task' as const }));
  const yesFlows = yesIds.map((id, i) =>
    i === 0
      ? { id: `f_split_${id}`, source: 'split', target: id }
      : { id: `f_${yesIds[i - 1]}_${id}`, source: yesIds[i - 1]!, target: id },
  );
  const yesLast = yesIds[yesIds.length - 1]!;
  return {
    nodes: [
      { id: 'start', type: 'startEvent' },
      { id: 'split', type: 'exclusiveGateway' },
      ...yesNodes,
      { id: 'no', type: 'task' },
      { id: 'join', type: 'exclusiveGateway' },
      { id: 'end', type: 'endEvent' },
    ],
    sequenceFlows: [
      { id: 'f_start_split', source: 'start', target: 'split' },
      ...yesFlows,
      { id: 'f_split_no', source: 'split', target: 'no' },
      { id: `f_${yesLast}_join`, source: yesLast, target: 'join' },
      { id: 'f_no_join', source: 'no', target: 'join' },
      { id: 'f_join_end', source: 'join', target: 'end' },
    ],
    regions: [
      {
        id: 'xor1',
        split: 'split',
        join: 'join',
        branches: [
          { id: 'yes', nodes: yesIds },
          { id: 'no', nodes: ['no'] },
        ],
      },
    ],
  };
}

function allOrthogonal(result: LayoutResult) {
  for (const [id, waypoints] of Object.entries(result.edges)) {
    expect(isOrthogonal(waypoints), id).toBe(true);
  }
}

describe('layout', () => {
  it('linear start→task→end is identical on every run', () => {
    const a = layout(linear());
    const b = layout(linear());
    expect(a).toEqual(b);
    expect(a).toMatchSnapshot();
  });

  it('happy path shares one LTR baseline', () => {
    const result = layout(linear());
    expect(centerY(result.shapes.start!)).toBe(BASELINE_CY);
    expect(centerY(result.shapes.task!)).toBe(BASELINE_CY);
    expect(centerY(result.shapes.end!)).toBe(BASELINE_CY);
    expect(result.shapes.start!.x).toBeLessThan(result.shapes.task!.x);
    expect(result.shapes.task!.x).toBeLessThan(result.shapes.end!.x);
    expect(result.shapes.task!.x - (result.shapes.start!.x + result.shapes.start!.width)).toBe(
      TOKENS.forwardFlowGap,
    );
    expect(result.shapes.end!.x - (result.shapes.task!.x + result.shapes.task!.width)).toBe(
      TOKENS.forwardFlowGap,
    );
    allOrthogonal(result);
  });

  it('places Start/End labels below the event with a gap and full name width', () => {
    const di = layoutProcess(createProcess());
    for (const [id, name] of [
      ['StartEvent_1', 'Start'],
      ['EndEvent_1', 'End'],
    ] as const) {
      const shape = di.shapes[id]!;
      const label = di.labels[id]!;
      expect(label.y).toBe(shape.y + shape.height + TOKENS.label.gap);
      expect(label.width).toBeGreaterThanOrEqual(TOKENS.label.width);
      expect(label.width).toBeGreaterThanOrEqual(name.length * TOKENS.label.charWidth);
      expect(label.height).toBe(TOKENS.label.height);
      expect(label.x + label.width / 2).toBe(shape.x + shape.width / 2);
    }
  });

  it('XOR split/join align; branches are symmetric; join follows longest', () => {
    const result = layout(xor(['yes']));
    const split = result.shapes.split!;
    const join = result.shapes.join!;
    const yes = result.shapes.yes!;
    const no = result.shapes.no!;

    expect(centerY(split)).toBe(BASELINE_CY);
    expect(centerY(join)).toBe(BASELINE_CY);
    expect(split.y).toBe(join.y);
    expect(yes.y).toBeLessThan(no.y);
    expect(BASELINE_CY - centerY(yes)).toBe(centerY(no) - BASELINE_CY);
    expect(no.y - (yes.y + yes.height)).toBe(TOKENS.branchGap);
    expect(join.x).toBe(yes.x + yes.width + TOKENS.forwardFlowGap);

    const long = layout(xor(['yes', 'yes2']));
    const last = long.shapes.yes2!;
    expect(long.shapes.join!.x).toBe(last.x + last.width + TOKENS.forwardFlowGap);
    expect(long.shapes.join!.x).toBeGreaterThan(long.shapes.no!.x + long.shapes.no!.width + TOKENS.forwardFlowGap);
    allOrthogonal(result);
    allOrthogonal(long);
  });

  it('adding a task on Yes does not swap Yes/No bands', () => {
    const short = layout(xor(['yes']));
    const long = layout(xor(['yes', 'yes2']));
    expect(short.shapes.yes!.y).toBeLessThan(short.shapes.no!.y);
    expect(long.shapes.yes!.y).toBeLessThan(long.shapes.no!.y);
    expect(long.shapes.yes).toEqual(short.shapes.yes);
    expect(long.shapes.no).toEqual(short.shapes.no);
    expect(long.shapes.split).toEqual(short.shapes.split);
    expect(long.shapes.start).toEqual(short.shapes.start);
  });

  it('band order follows branches[], not sequenceFlows order', () => {
    const input = xor(['yes']);
    const reversed: LayoutInput = {
      ...input,
      sequenceFlows: [...input.sequenceFlows].reverse(),
    };
    expect(layout(reversed).shapes.yes).toEqual(layout(input).shapes.yes);
    expect(layout(reversed).shapes.no).toEqual(layout(input).shapes.no);
  });

  it('adapts a semantic-core-shaped process', () => {
    expect(
      layoutProcess({
        root: {
          flowNodes: [
            { id: 'start', type: 'start' },
            { id: 'task', type: 'task' },
            { id: 'end', type: 'end' },
          ],
          sequenceFlows: [
            { id: 'f1', sourceRef: 'start', targetRef: 'task' },
            { id: 'f2', source: 'task', target: 'end' },
          ],
        },
      }),
    ).toEqual(layout(linear()));
  });

  it('lays out a real semantic-core XOR without swapping branch bands', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'A')!.id }).process;
    const yes = p.regions[0]!.branches[0]!.id;
    const no = p.regions[0]!.branches[1]!.id;
    p = addTask(p, { name: 'YesTask', branchId: yes }).process;
    p = addTask(p, { name: 'NoTask', branchId: no }).process;
    const short = layoutProcess(p);
    p = addTask(p, { name: 'Extra', branchId: yes }).process;
    const long = layoutProcess(p);

    const yesTask = p.nodes.find((n) => n.name === 'YesTask')!.id;
    const noTask = p.nodes.find((n) => n.name === 'NoTask')!.id;
    expect(short.shapes[yesTask]!.y).toBeLessThan(short.shapes[noTask]!.y);
    expect(long.shapes[yesTask]!.y).toBeLessThan(long.shapes[noTask]!.y);
    expect(long.shapes[noTask]).toEqual(short.shapes[noTask]);
    expect(long.shapes[yesTask]).toEqual(short.shapes[yesTask]);
    allOrthogonal(short);
    allOrthogonal(long);
  });

  it('addTask via op produces a stable layout snapshot', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    const a = layoutProcess(p);
    const b = layoutProcess(p);
    expect(a).toEqual(b);
    expect(a).toMatchSnapshot();
  });

  it('stacked pools keep host XOR geometry; message flows are orthogonal', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'A')!.id }).process;
    const yes = p.regions[0]!.branches[0]!.id;
    const no = p.regions[0]!.branches[1]!.id;
    p = addTask(p, { name: 'YesTask', branchId: yes }).process;
    p = addTask(p, { name: 'NoTask', branchId: no }).process;
    const before = layoutProcess(p);

    const pooled = addPool(p, { name: 'Partner' });
    p = pooled.process;
    const host = p.participants[0]!.id;
    const partner = p.participants[1]!.id;
    p = addMessageInteraction(p, { from: host, to: partner, name: 'Ask' }).process;
    const after = layoutProcess(p);

    const yesTask = p.nodes.find((n) => n.name === 'YesTask')!.id;
    const noTask = p.nodes.find((n) => n.name === 'NoTask')!.id;
    const split = p.regions[0]!.split;
    expect(after.shapes[yesTask]).toEqual(before.shapes[yesTask]);
    expect(after.shapes[noTask]).toEqual(before.shapes[noTask]);
    expect(after.shapes[split]).toEqual(before.shapes[split]);
    expect(after.shapes[yesTask]!.y).toBeLessThan(after.shapes[noTask]!.y);

    const hostBox = after.shapes[host]!;
    const partnerBox = after.shapes[partner]!;
    expect(hostBox.y).toBeLessThan(partnerBox.y);
    expect(partnerBox.y).toBeGreaterThanOrEqual(hostBox.y + hostBox.height);
    const mf = p.messageFlows[0]!.id;
    expect(isOrthogonal(after.edges[mf]!)).toBe(true);
    allOrthogonal(after);

    p = addLane(p, { participantId: host, name: 'Clerk' }).process;
    p = addLane(p, { participantId: host, name: 'Manager' }).process;
    const withLanes = layoutProcess(p);
    expect(withLanes.shapes[yesTask]).toEqual(before.shapes[yesTask]);
    expect(withLanes.shapes[p.lanes[0]!.id]!.y).toBeLessThan(withLanes.shapes[p.lanes[1]!.id]!.y);
  });

  it('subprocess is an expanded box containing nested layout', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = wrapInSubprocess(p, [p.nodes.find((n) => n.name === 'A')!.id], { name: 'Review' }).process;
    const result = layoutProcess(p);
    const sub = p.nodes.find((n) => n.type === 'subProcess')!;
    const inner = p.nodes.find((n) => n.name === 'A')!;
    const box = result.shapes[sub.id]!;
    const task = result.shapes[inner.id]!;
    expect(box.width).toBeGreaterThan(task.width);
    expect(box.height).toBeGreaterThan(task.height);
    expect(task.x).toBeGreaterThan(box.x);
    expect(task.x + task.width).toBeLessThan(box.x + box.width);
    expect(task.y).toBeGreaterThan(box.y);
    expect(task.y + task.height).toBeLessThan(box.y + box.height);
    allOrthogonal(result);
  });

  it('event subprocess sits below without swapping XOR bands', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'A')!.id }).process;
    const yes = p.regions[0]!.branches[0]!.id;
    const no = p.regions[0]!.branches[1]!.id;
    p = addTask(p, { name: 'YesTask', branchId: yes }).process;
    p = addTask(p, { name: 'NoTask', branchId: no }).process;
    const before = layoutProcess(p);
    p = createEventSubprocess(p).process;
    const after = layoutProcess(p);

    const yesTask = p.nodes.find((n) => n.name === 'YesTask')!.id;
    const noTask = p.nodes.find((n) => n.name === 'NoTask')!.id;
    const split = p.regions.find((r) => r.type === 'exclusive')!.split;
    expect(after.shapes[yesTask]).toEqual(before.shapes[yesTask]);
    expect(after.shapes[noTask]).toEqual(before.shapes[noTask]);
    expect(after.shapes[split]).toEqual(before.shapes[split]);
    expect(after.shapes[yesTask]!.y).toBeLessThan(after.shapes[noTask]!.y);

    const eventSub = p.nodes.find((n) => n.triggeredByEvent)!;
    expect(after.shapes[eventSub.id]!.y).toBeGreaterThan(after.shapes[noTask]!.y + after.shapes[noTask]!.height);
    allOrthogonal(after);
  });

  it('places Start/End names below the circle with a gap and full-name width', () => {
    const result = layoutProcess(createProcess());
    const start = result.shapes.StartEvent_1!;
    const end = result.shapes.EndEvent_1!;
    const startLabel = result.labels.StartEvent_1!;
    const endLabel = result.labels.EndEvent_1!;

    expect(startLabel.y - (start.y + start.height)).toBe(TOKENS.label.gap);
    expect(endLabel.y - (end.y + end.height)).toBe(TOKENS.label.gap);
    expect(TOKENS.label.gap).toBeGreaterThanOrEqual(TOKENS.baseGrid);
    expect(startLabel.width).toBeGreaterThanOrEqual(TOKENS.label.width);
    expect(startLabel.width).toBeGreaterThanOrEqual('Start'.length * TOKENS.label.charWidth);
    expect(endLabel.width).toBeGreaterThanOrEqual(TOKENS.label.width);
    expect(endLabel.width).toBeGreaterThanOrEqual('End'.length * TOKENS.label.charWidth);
  });

  it('widens event label DI for names longer than Start', () => {
    const p = renameElement(createProcess(), 'StartEvent_1', 'Start process here').process;
    const label = layoutProcess(p).labels.StartEvent_1!;
    expect(label.width).toBeGreaterThan(TOKENS.label.width);
    expect(label.width).toBeGreaterThanOrEqual('Start process here'.length * TOKENS.label.charWidth);
  });
});
