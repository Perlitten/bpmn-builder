import { addLane, addMessageInteraction, addPool, addTask, attachBoundaryTimer, createEventSubprocess, createFromComponent, createProcess, renameElement, splitExclusive, splitParallel, wrapInSubprocess } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { layout, layoutProcess } from './layout.js';
import { centerY, isOrthogonal } from './route.js';
import { BASELINE_CY, TOKENS } from './tokens.js';
import type { Bounds, LayoutInput, LayoutResult } from './types.js';

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

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function expectDistinctBands(boxes: Bounds[]) {
  expect(new Set(boxes.map((b) => b.y)).size).toBe(boxes.length);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlaps(boxes[i]!, boxes[j]!), `${i} overlaps ${j}`).toBe(false);
    }
  }
}

/** AND split → three tasks → AND join. */
function threeParallelAnd(regions: boolean): LayoutInput {
  return {
    nodes: [
      { id: 'start', type: 'startEvent' },
      { id: 'split', type: 'parallelGateway' },
      { id: 'a', type: 'task' },
      { id: 'b', type: 'task' },
      { id: 'c', type: 'task' },
      { id: 'join', type: 'parallelGateway' },
      { id: 'end', type: 'endEvent' },
    ],
    sequenceFlows: [
      { id: 'f_start_split', source: 'start', target: 'split' },
      { id: 'f_split_a', source: 'split', target: 'a' },
      { id: 'f_split_b', source: 'split', target: 'b' },
      { id: 'f_split_c', source: 'split', target: 'c' },
      { id: 'f_a_join', source: 'a', target: 'join' },
      { id: 'f_b_join', source: 'b', target: 'join' },
      { id: 'f_c_join', source: 'c', target: 'join' },
      { id: 'f_join_end', source: 'join', target: 'end' },
    ],
    ...(regions
      ? {
          regions: [
            {
              id: 'and3',
              split: 'split',
              join: 'join',
              branches: [
                { id: 'ba', nodes: ['a'] },
                { id: 'bb', nodes: ['b'] },
                { id: 'bc', nodes: ['c'] },
              ],
            },
          ],
        }
      : {}),
  };
}

/** Happy path plus three message-catch side chains with no sequence from the main line. */
function threeMessageCatchSides(): LayoutInput {
  return {
    nodes: [
      { id: 'start', type: 'startEvent' },
      { id: 'main', type: 'task' },
      { id: 'end', type: 'endEvent' },
      { id: 'catchA', type: 'intermediateCatch' },
      { id: 'a', type: 'task' },
      { id: 'endA', type: 'endEvent' },
      { id: 'catchB', type: 'intermediateCatch' },
      { id: 'b', type: 'task' },
      { id: 'endB', type: 'endEvent' },
      { id: 'catchC', type: 'intermediateCatch' },
      { id: 'c', type: 'task' },
      { id: 'endC', type: 'endEvent' },
    ],
    sequenceFlows: [
      { id: 'f_start_main', source: 'start', target: 'main' },
      { id: 'f_main_end', source: 'main', target: 'end' },
      { id: 'f_catchA_a', source: 'catchA', target: 'a' },
      { id: 'f_a_endA', source: 'a', target: 'endA' },
      { id: 'f_catchB_b', source: 'catchB', target: 'b' },
      { id: 'f_b_endB', source: 'b', target: 'endB' },
      { id: 'f_catchC_c', source: 'catchC', target: 'c' },
      { id: 'f_c_endC', source: 'c', target: 'endC' },
    ],
  };
}

/** 16 nodes / 15 flows: payment XOR → inventory XOR, each branch ends (no join). */
function unmatchedNestedXor(): LayoutInput {
  const tasks = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'] as const;
  return {
    nodes: [
      { id: 'start', type: 'startEvent' },
      ...tasks.map((id) => ({ id, type: 'task' as const })),
      { id: 'xorPay', type: 'exclusiveGateway' },
      { id: 'xorInv', type: 'exclusiveGateway' },
      { id: 'end1', type: 'endEvent' },
      { id: 'end2', type: 'endEvent' },
      { id: 'end3', type: 'endEvent' },
    ],
    sequenceFlows: [
      { id: 'f_s_t1', source: 'start', target: 't1' },
      { id: 'f_t1_t2', source: 't1', target: 't2' },
      { id: 'f_t2_pay', source: 't2', target: 'xorPay' },
      { id: 'f_pay_t3', source: 'xorPay', target: 't3' },
      { id: 'f_t3_e1', source: 't3', target: 'end1' },
      { id: 'f_pay_t4', source: 'xorPay', target: 't4' },
      { id: 'f_t4_inv', source: 't4', target: 'xorInv' },
      { id: 'f_inv_t5', source: 'xorInv', target: 't5' },
      { id: 'f_t5_t6', source: 't5', target: 't6' },
      { id: 'f_t6_t7', source: 't6', target: 't7' },
      { id: 'f_t7_e2', source: 't7', target: 'end2' },
      { id: 'f_inv_t8', source: 'xorInv', target: 't8' },
      { id: 'f_t8_t9', source: 't8', target: 't9' },
      { id: 'f_t9_t10', source: 't9', target: 't10' },
      { id: 'f_t10_e3', source: 't10', target: 'end3' },
    ],
  };
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
    expect(after.shapes[yesTask]!.y).toBe(before.shapes[yesTask]!.y);
    expect(after.shapes[noTask]!.y).toBe(before.shapes[noTask]!.y);
    expect(after.shapes[split]!.y).toBe(before.shapes[split]!.y);
    expect(after.shapes[yesTask]!.x).toBeGreaterThan(before.shapes[yesTask]!.x);
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
    expect(withLanes.shapes[yesTask]).toEqual(after.shapes[yesTask]);
    expect(withLanes.shapes[p.lanes[0]!.id]!.y).toBeLessThan(withLanes.shapes[p.lanes[1]!.id]!.y);
  });

  it('Lane without a prior Pool stays inside one host pool and keeps flow gaps', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Task' }).process;
    p = addLane(p, { name: 'Clerk' }).process;
    p = addLane(p, { name: 'Manager' }).process;
    const di = layoutProcess(p);
    expect(p.participants).toHaveLength(1);
    const pool = di.shapes[p.participants[0]!.id]!;
    const clerk = di.shapes[p.lanes[0]!.id]!;
    const manager = di.shapes[p.lanes[1]!.id]!;
    expect(clerk.x).toBe(pool.x + TOKENS.poolHeader);
    expect(manager.x).toBe(clerk.x);
    expect(clerk.y).toBe(pool.y);
    expect(manager.y).toBeGreaterThan(clerk.y);
    expect(clerk.y + clerk.height).toBeLessThanOrEqual(pool.y + pool.height + 0.5);
    expect(manager.y + manager.height).toBeLessThanOrEqual(pool.y + pool.height + 0.5);
    const start = p.nodes.find((n) => n.type === 'start')!;
    const task = p.nodes.find((n) => n.name === 'Task')!;
    expect(di.shapes[task.id]!.x - (di.shapes[start.id]!.x + di.shapes[start.id]!.width)).toBe(
      TOKENS.poolInnerFlowGap,
    );
  });

  it('Start–Task–End inside a pool uses inner padding and a wider flow gap', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Task' }).process;
    const start = p.nodes.find((n) => n.type === 'start')!;
    const task = p.nodes.find((n) => n.name === 'Task')!;
    const end = p.nodes.find((n) => n.type === 'end')!;
    const bare = layoutProcess(p);
    expect(bare.shapes[task.id]!.x - (bare.shapes[start.id]!.x + bare.shapes[start.id]!.width)).toBe(
      TOKENS.forwardFlowGap,
    );

    p = addLane(p, { name: 'Clerk' }).process;
    const di = layoutProcess(p);
    const pool = di.shapes[p.participants[0]!.id]!;
    const startBox = di.shapes[start.id]!;
    const taskBox = di.shapes[task.id]!;
    const endBox = di.shapes[end.id]!;
    const startLabel = di.labels[start.id]!;
    const endLabel = di.labels[end.id]!;
    const gap = TOKENS.poolInnerFlowGap;
    expect(gap).toBeGreaterThan(TOKENS.forwardFlowGap);
    expect(taskBox.x - (startBox.x + startBox.width)).toBe(gap);
    expect(endBox.x - (taskBox.x + taskBox.width)).toBe(gap);
    expect(taskBox.x - (startBox.x + startBox.width)).toBeGreaterThan(
      bare.shapes[task.id]!.x - (bare.shapes[start.id]!.x + bare.shapes[start.id]!.width),
    );

    const pad = TOKENS.poolPad;
    expect(taskBox.y - pool.y).toBeGreaterThanOrEqual(pad);
    expect(pool.y + pool.height - (startLabel.y + startLabel.height)).toBeGreaterThanOrEqual(pad);
    expect(pool.y + pool.height - (endLabel.y + endLabel.height)).toBeGreaterThanOrEqual(pad);
    expect(startBox.x - (pool.x + TOKENS.poolHeader)).toBeGreaterThanOrEqual(pad);
    expect(pool.x + pool.width - (endBox.x + endBox.width)).toBeGreaterThanOrEqual(pad);
  });

  it('empty partner pools keep black-box height for a header band', () => {
    const pooled = addPool(createProcess(), { name: 'Partner' });
    const p = pooled.process;
    const di = layoutProcess(p);
    const partner = p.participants[1]!;
    expect(partner.processId).toBeDefined();
    expect(di.shapes[partner.id]!.height).toBe(TOKENS.blackBox.height);
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

  it('places every node of an unmatched nested XOR (no join)', () => {
    const input = unmatchedNestedXor();
    const result = layout(input);
    for (const node of input.nodes) {
      expect(result.shapes[node.id], node.id).toBeDefined();
    }
    for (const flow of input.sequenceFlows) {
      expect(result.edges[flow.id], flow.id).toBeDefined();
    }
    expect(Object.keys(result.shapes)).toHaveLength(input.nodes.length);
    expect(centerY(result.shapes.start!)).toBe(BASELINE_CY);
    expect(result.shapes.t3!.y).toBeLessThan(result.shapes.t4!.y);
    expect(result.shapes.t8!.y).toBeGreaterThan(result.shapes.t4!.y);
  });

  it('places a boundary event and its exception end next to the host', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    p = attachBoundaryTimer(p, { on: p.nodes.find((n) => n.name === 'Review')!.id, name: 'SLA' }).process;
    const result = layoutProcess(p);
    const host = p.nodes.find((n) => n.name === 'Review')!;
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    const exEnd = p.exceptionBranches[0]!.nodeIds[0]!;
    expect(result.shapes[host.id]).toBeDefined();
    expect(result.shapes[boundary.id]).toBeDefined();
    expect(result.shapes[exEnd]).toBeDefined();
    expect(result.shapes[boundary.id]!.y).toBeGreaterThan(result.shapes[host.id]!.y);
  });

  it('does not collapse three parallel AND branches onto one overlapping row', () => {
    const structured = layout(threeParallelAnd(true));
    expectDistinctBands([structured.shapes.a!, structured.shapes.b!, structured.shapes.c!]);
    expect(structured.shapes.a!.x).toBe(structured.shapes.b!.x);
    expect(structured.shapes.b!.x).toBe(structured.shapes.c!.x);
    allOrthogonal(structured);

    const unmatched = layout(threeParallelAnd(false));
    expectDistinctBands([unmatched.shapes.a!, unmatched.shapes.b!, unmatched.shapes.c!]);
    allOrthogonal(unmatched);

    let p = createProcess();
    p = addTask(p, { name: 'Before' }).process;
    p = splitParallel(p, {
      after: p.nodes.find((n) => n.name === 'Before')!.id,
      branches: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    }).process;
    expect(p.regions[0]!.branches).toHaveLength(3);
    const [ba, bb, bc] = p.regions[0]!.branches;
    p = addTask(p, { name: 'DoA', branchId: ba!.id }).process;
    p = addTask(p, { name: 'DoB', branchId: bb!.id }).process;
    p = addTask(p, { name: 'DoC', branchId: bc!.id }).process;
    const di = layoutProcess(p);
    const boxes = ['DoA', 'DoB', 'DoC'].map((name) => di.shapes[p.nodes.find((n) => n.name === name)!.id]!);
    expectDistinctBands(boxes);
  });

  it('stacks three message-catch side paths instead of one remainder row', () => {
    const input = threeMessageCatchSides();
    const result = layout(input);
    for (const node of input.nodes) {
      expect(result.shapes[node.id], node.id).toBeDefined();
    }
    expectDistinctBands([result.shapes.a!, result.shapes.b!, result.shapes.c!]);
    expect(result.shapes.catchA!.x).toBeLessThan(result.shapes.a!.x);
    expect(result.shapes.a!.x).toBeLessThan(result.shapes.endA!.x);
    expect(centerY(result.shapes.catchA!)).toBe(centerY(result.shapes.a!));
    expect(centerY(result.shapes.catchB!)).toBe(centerY(result.shapes.b!));
    expect(centerY(result.shapes.catchC!)).toBe(centerY(result.shapes.c!));
    expect(result.shapes.a!.y).toBeGreaterThan(result.shapes.main!.y);
    allOrthogonal(result);
  });

  it('places data objects and annotations with canonical DI, not imported XY', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    p = createFromComponent(p, 'data.object', { name: 'File' }).process;
    p = createFromComponent(p, 'artifact.textAnnotation', {
      after: p.nodes.find((n) => n.name === 'Review')!.id,
      name: 'Note',
    }).process;
    const di = layoutProcess(p);
    const data = p.artifacts!.find((item) => String(item.$type).includes('DataObject'))!;
    const note = p.artifacts!.find((item) => String(item.$type).endsWith('TextAnnotation'))!;
    const assoc = p.artifacts!.find((item) => String(item.$type).endsWith('Association'))!;
    expect(di.shapes[String(data.id)]).toBeDefined();
    expect(di.shapes[String(note.id)]).toBeDefined();
    expect(di.edges[String(assoc.id)]?.length).toBeGreaterThan(1);
    const host = di.shapes[p.nodes.find((n) => n.name === 'Review')!.id]!;
    expect(di.shapes[String(data.id)]!.y).toBeGreaterThan(host.y);
  });
});
