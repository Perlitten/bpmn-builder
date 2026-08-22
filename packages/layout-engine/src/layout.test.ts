import { addLane, addMessageInteraction, addPool, addTask, assignLane, attachBoundaryTimer, createEventSubprocess, createFromComponent, createProcess, renameElement, splitExclusive, splitParallel, wrapInSubprocess } from '@bpmn/semantic-core';
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

/** Reusable geometric assertion: asserts no label bounding box intersects any node shape bounding box. */
function assertNoLabelNodeIntersections(result: LayoutResult, input?: LayoutInput) {
  const containerIds = new Set([
    ...(input?.participants ?? []).map((p) => p.id),
    ...(input?.lanes ?? []).map((l) => l.id),
  ]);
  const nodeShapes = Object.entries(result.shapes).filter(([id]) => !containerIds.has(id));

  for (const [labelId, labelBox] of Object.entries(result.labels)) {
    for (const [nodeId, nodeBox] of nodeShapes) {
      if (labelId === nodeId) continue; // External label for node itself sits directly below node
      expect(
        overlaps(labelBox, nodeBox),
        `Label '${labelId}' overlaps node/shape '${nodeId}'`,
      ).toBe(false);
    }
  }
}

/** Reusable geometric assertion: asserts no label bounding box intersects any other label bounding box. */
function assertNoLabelLabelIntersections(result: LayoutResult) {
  const labelEntries = Object.entries(result.labels);
  for (let i = 0; i < labelEntries.length; i++) {
    for (let j = i + 1; j < labelEntries.length; j++) {
      const [id1, box1] = labelEntries[i]!;
      const [id2, box2] = labelEntries[j]!;
      expect(
        overlaps(box1, box2),
        `Label '${id1}' overlaps label '${id2}'`,
      ).toBe(false);
    }
  }
}

/** Reusable geometric assertion: asserts branch vertical bands do not overlap and have minimum clearance. */
function assertNonOverlappingBranchBands(
  branchBoxes: Bounds[][],
  minClearance = TOKENS.branchGap,
) {
  const bands = branchBoxes.map((boxes, i) => {
    expect(boxes.length, `Branch band ${i} should have shapes`).toBeGreaterThan(0);
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    return { minY, maxY };
  });

  bands.sort((a, b) => a.minY - b.minY);

  for (let i = 0; i < bands.length - 1; i++) {
    const current = bands[i]!;
    const next = bands[i + 1]!;
    const gap = next.minY - current.maxY;
    expect(
      gap,
      `Band ${i} (y:${current.minY}..${current.maxY}) overlaps or is too close to Band ${i + 1} (y:${next.minY}..${next.maxY})`,
    ).toBeGreaterThanOrEqual(minClearance);
  }
}

/** Longest horizontal segment Y — the visible rail of an orthogonal sequence flow. */
function railY(points: Array<{ x: number; y: number }>): number {
  let bestY = points[0]!.y;
  let bestLen = -1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.y !== b.y) continue;
    const len = Math.abs(b.x - a.x);
    if (len > bestLen) {
      bestLen = len;
      bestY = a.y;
    }
  }
  return bestY;
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

/** Requester / Manager / Finance, with Review assigned to Manager and Finance left empty. */
function threeLanes() {
  let p = createProcess();
  p = addTask(p, { name: 'Submit' }).process;
  p = addLane(p, { name: 'Requester' }).process;
  p = addLane(p, { name: 'Manager' }).process;
  p = addLane(p, { name: 'Finance' }).process;
  p = addTask(p, { name: 'Review' }).process;
  const oneLane = layoutProcess(p);
  p = assignLane(p, p.nodes.find((n) => n.name === 'Review')!.id, p.lanes[1]!.id).process;
  const node = (name: string) => p.nodes.find((n) => n.name === name)!.id;
  const lane = (name: string) => p.lanes.find((l) => l.name === name)!.id;
  return { process: p, di: layoutProcess(p), oneLane, node, lane };
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

  it('puts every node in the band of the lane that claims it', () => {
    const { process, di, oneLane, lane, node } = threeLanes();
    const requester = di.shapes[lane('Requester')]!;
    const manager = di.shapes[lane('Manager')]!;
    const finance = di.shapes[lane('Finance')]!;
    expectDistinctBands([requester, manager, finance]);

    for (const band of process.lanes) {
      const box = di.shapes[band.id]!;
      for (const id of band.nodeIds) {
        const shape = di.shapes[id]!;
        expect(shape.y, `${id} above ${band.name}`).toBeGreaterThanOrEqual(box.y);
        expect(shape.y + shape.height, `${id} below ${band.name}`).toBeLessThanOrEqual(box.y + box.height);
      }
    }
    /* the reported blocker: a Manager task drawn inside the Requester band */
    const review = di.shapes[node('Review')]!;
    expect(review.y).toBeGreaterThanOrEqual(manager.y);
    expect(review.y + review.height).toBeLessThanOrEqual(manager.y + manager.height);
    expect(review.y).toBeGreaterThan(requester.y + requester.height);
    /* only the band moves: X still comes from the canonical chain */
    for (const name of ['Submit', 'Review']) {
      expect(di.shapes[node(name)]!.x, name).toBe(oneLane.shapes[node(name)]!.x);
    }
    for (const flow of process.flows) {
      const points = di.edges[flow.id]!;
      const source = di.shapes[flow.source]!;
      const target = di.shapes[flow.target]!;
      expect(points[0], `${flow.id} source waypoint`).toEqual({
        x: source.x + source.width,
        y: centerY(source),
      });
      expect(points.at(-1), `${flow.id} target waypoint`).toEqual({
        x: target.x,
        y: centerY(target),
      });
    }
    allOrthogonal(di);
  });

  it('keeps an empty lane as a visible band and the pool as the band stack', () => {
    const { process, di, lane } = threeLanes();
    const finance = di.shapes[lane('Finance')]!;
    expect(finance.height).toBeGreaterThanOrEqual(TOKENS.laneMinHeight);
    const pool = di.shapes[process.participants[0]!.id]!;
    const bands = process.lanes.map((l) => di.shapes[l.id]!);
    expect(bands[0]!.y).toBe(pool.y);
    expect(bands.at(-1)!.y + bands.at(-1)!.height).toBe(pool.y + pool.height);
    expect(bands.reduce((sum, b) => sum + b.height, 0)).toBe(pool.height);
    for (const band of bands) expect(band.x).toBe(pool.x + TOKENS.poolHeader);
  });

  it('emits whole-pixel lane geometry, never pool height ÷ lane count', () => {
    const { di } = threeLanes();
    for (const [id, box] of Object.entries(di.shapes)) {
      for (const [key, value] of Object.entries(box)) {
        expect(Number.isInteger(value), `${id}.${key} = ${value}`).toBe(true);
      }
    }
    for (const [id, box] of Object.entries(di.labels)) {
      for (const [key, value] of Object.entries(box)) {
        expect(Number.isInteger(value), `${id}.${key} = ${value}`).toBe(true);
      }
    }
  });

  it('separates the two XOR branch labels instead of stacking them on one point', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'A')!.id }).process;
    const named = p.flows.filter((f) => f.name);
    expect(named.map((f) => f.name)).toEqual(['Yes', 'No']);
    const di = layoutProcess(p);
    const [yes, no] = named.map((f) => di.labels[f.id]!);
    expect(yes).toBeDefined();
    expect(no).toBeDefined();
    expect(overlaps(yes!, no!)).toBe(false);
  });

  it('routes empty Yes/No XOR branches on distinct rails, not one split→join stroke', () => {
    let p = createProcess();
    for (const name of ['Submit request', 'Review request', 'Check budget']) {
      const after = p.nodes.filter((n) => n.type === 'task').at(-1)?.id;
      p = addTask(p, { name, ...(after ? { after } : {}) }).process;
    }
    p = splitExclusive(p, {
      after: p.nodes.find((n) => n.name === 'Check budget')!.id,
      name: 'Approved?',
    }).process;
    const yes = p.flows.find((f) => f.name === 'Yes')!;
    const no = p.flows.find((f) => f.name === 'No')!;
    expect(yes.source).toBe(no.source);
    expect(yes.target).toBe(no.target);
    expect(p.regions[0]!.branches.map((b) => b.nodeIds)).toEqual([[], []]);

    const di = layoutProcess(p);
    const yesPts = di.edges[yes.id]!;
    const noPts = di.edges[no.id]!;
    expect(yesPts.length).toBeGreaterThan(2);
    expect(noPts.length).toBeGreaterThan(2);
    expect(JSON.stringify(yesPts)).not.toBe(JSON.stringify(noPts));
    expect(railY(yesPts)).toBeLessThan(railY(noPts));
    expect(overlaps(di.labels[yes.id]!, di.labels[no.id]!)).toBe(false);
    expect(di.labels[yes.id]!.y).toBeLessThan(di.labels[no.id]!.y);
    allOrthogonal(di);

    let pooled = createProcess();
    pooled = addPool(pooled, { name: 'Purchase-to-Pay' }).process;
    pooled = addLane(pooled, { name: 'Requester' }).process;
    pooled = addLane(pooled, { name: 'Manager' }).process;
    for (const name of ['Submit request', 'Review request', 'Check budget']) {
      const after = pooled.nodes.filter((n) => n.type === 'task').at(-1)?.id;
      pooled = addTask(pooled, { name, ...(after ? { after } : {}) }).process;
    }
    pooled = splitExclusive(pooled, {
      after: pooled.nodes.find((n) => n.name === 'Check budget')!.id,
      name: 'Approved?',
    }).process;
    const poolYes = pooled.flows.find((f) => f.name === 'Yes')!;
    const poolNo = pooled.flows.find((f) => f.name === 'No')!;
    const poolDi = layoutProcess(pooled);
    const poolYesPts = poolDi.edges[poolYes.id]!;
    const poolNoPts = poolDi.edges[poolNo.id]!;
    expect(JSON.stringify(poolYesPts)).not.toBe(JSON.stringify(poolNoPts));
    expect(railY(poolYesPts)).toBeLessThan(railY(poolNoPts));
    expect(overlaps(poolDi.labels[poolYes.id]!, poolDi.labels[poolNo.id]!)).toBe(false);
    allOrthogonal(poolDi);
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

  describe('regression tests for defect requirements', () => {
    it('Requirement 1: XOR split gateway branches sit in separate vertical bands with guaranteed clearance', () => {
      // 1a. Structured XOR split
      let p = createProcess();
      p = addTask(p, { name: 'Check data' }).process;
      p = splitExclusive(p, {
        after: p.nodes.find((n) => n.name === 'Check data')!.id,
        name: 'Is valid?',
      }).process;
      const yesBranch = p.regions[0]!.branches[0]!.id;
      const noBranch = p.regions[0]!.branches[1]!.id;
      p = addTask(p, { name: 'Process request', branchId: yesBranch }).process;
      p = addTask(p, { name: 'Send error notice', branchId: noBranch }).process;

      const result = layoutProcess(p);
      const yesTask = result.shapes[p.nodes.find((n) => n.name === 'Process request')!.id]!;
      const noTask = result.shapes[p.nodes.find((n) => n.name === 'Send error notice')!.id]!;

      assertNonOverlappingBranchBands([[yesTask], [noTask]], TOKENS.branchGap);

      // 1b. Unstructured XOR split (no matching join gateway)
      const inputUnstructured: LayoutInput = {
        nodes: [
          { id: 'start', type: 'startEvent' },
          { id: 'split', type: 'exclusiveGateway' },
          { id: 'validTask', type: 'task', name: 'Process request' },
          { id: 'end1', type: 'endEvent' },
          { id: 'invalidTask', type: 'task', name: 'Send error notice' },
          { id: 'end2', type: 'endEvent' },
        ],
        sequenceFlows: [
          { id: 'f_start', source: 'start', target: 'split' },
          { id: 'f_valid', source: 'split', target: 'validTask', name: 'Данные верны' },
          { id: 'f_end1', source: 'validTask', target: 'end1' },
          { id: 'f_invalid', source: 'split', target: 'invalidTask', name: 'Данные некорректны' },
          { id: 'f_end2', source: 'invalidTask', target: 'end2' },
        ],
      };
      const unstructResult = layout(inputUnstructured);
      const branch1Boxes = [unstructResult.shapes.validTask!, unstructResult.shapes.end1!];
      const branch2Boxes = [unstructResult.shapes.invalidTask!, unstructResult.shapes.end2!];

      assertNonOverlappingBranchBands([branch1Boxes, branch2Boxes], TOKENS.branchGap);
    });

    it('Requirement 2: Every edge label bounding box does not intersect any node bounding box', () => {
      let p = createProcess();
      p = addTask(p, { name: 'Check data' }).process;
      p = splitExclusive(p, {
        after: p.nodes.find((n) => n.name === 'Check data')!.id,
        name: 'Is valid?',
      }).process;
      const yesBranch = p.regions[0]!.branches[0]!.id;
      const noBranch = p.regions[0]!.branches[1]!.id;
      p = addTask(p, { name: 'Process request', branchId: yesBranch }).process;
      p = addTask(p, { name: 'Send error notice', branchId: noBranch }).process;

      // Give flow long label strings as in reported defect
      const yesFlow = p.flows.find((f) => f.target === p.nodes.find((n) => n.name === 'Process request')!.id)!;
      const noFlow = p.flows.find((f) => f.target === p.nodes.find((n) => n.name === 'Send error notice')!.id)!;
      yesFlow.name = 'Данные абсолютно верны';
      noFlow.name = 'Данные некорректны';

      const result = layoutProcess(p);
      assertNoLabelNodeIntersections(result);

      // Unstructured XOR split with edge labels
      const inputUnstructured: LayoutInput = {
        nodes: [
          { id: 'start', type: 'startEvent' },
          { id: 'split', type: 'exclusiveGateway' },
          { id: 'validTask', type: 'task', name: 'Process request' },
          { id: 'end1', type: 'endEvent' },
          { id: 'invalidTask', type: 'task', name: 'Send error notice' },
          { id: 'end2', type: 'endEvent' },
        ],
        sequenceFlows: [
          { id: 'f_start', source: 'start', target: 'split' },
          { id: 'f_valid', source: 'split', target: 'validTask', name: 'Данные абсолютно верны' },
          { id: 'f_end1', source: 'validTask', target: 'end1' },
          { id: 'f_invalid', source: 'split', target: 'invalidTask', name: 'Данные некорректны' },
          { id: 'f_end2', source: 'invalidTask', target: 'end2' },
        ],
      };
      const unstructResult = layout(inputUnstructured);
      assertNoLabelNodeIntersections(unstructResult, inputUnstructured);
    });

    it('Requirement 3: Edge labels do not intersect other edge labels or external node labels', () => {
      let p = createProcess();
      p = addTask(p, { name: 'Check data' }).process;
      p = splitExclusive(p, {
        after: p.nodes.find((n) => n.name === 'Check data')!.id,
        name: 'Is valid?',
      }).process;
      const yesBranch = p.regions[0]!.branches[0]!.id;
      const noBranch = p.regions[0]!.branches[1]!.id;
      p = addTask(p, { name: 'Process request', branchId: yesBranch }).process;
      p = addTask(p, { name: 'Send error notice', branchId: noBranch }).process;

      const result = layoutProcess(p);
      assertNoLabelLabelIntersections(result);
    });

    it('Requirement 3 (linear non-regression): Straight sequence of tasks lays out identically', () => {
      const input = linear();
      const result = layout(input);
      expect(centerY(result.shapes.start!)).toBe(BASELINE_CY);
      expect(centerY(result.shapes.task!)).toBe(BASELINE_CY);
      expect(centerY(result.shapes.end!)).toBe(BASELINE_CY);
      expect(result.shapes.task!.x - (result.shapes.start!.x + result.shapes.start!.width)).toBe(TOKENS.forwardFlowGap);
      expect(result.shapes.end!.x - (result.shapes.task!.x + result.shapes.task!.width)).toBe(TOKENS.forwardFlowGap);
      allOrthogonal(result);
      assertNoLabelNodeIntersections(result, input);
      assertNoLabelLabelIntersections(result);
    });

    it('Item 1 regression: reconverging unstructured split places shared suffix once after the longest branch', () => {
      const input: LayoutInput = {
        nodes: [
          { id: 'start', type: 'startEvent' },
          { id: 'split', type: 'exclusiveGateway' },
          { id: 'a1', type: 'task', name: 'A1' },
          { id: 'a2', type: 'task', name: 'A2' },
          { id: 'b1', type: 'task', name: 'B1' },
          { id: 'join', type: 'task', name: 'Join Task' },
          { id: 'end', type: 'endEvent' },
        ],
        sequenceFlows: [
          { id: 'f0', source: 'start', target: 'split' },
          { id: 'fa1', source: 'split', target: 'a1' },
          { id: 'fa2', source: 'a1', target: 'a2' },
          { id: 'fa_join', source: 'a2', target: 'join' },
          { id: 'fb1', source: 'split', target: 'b1' },
          { id: 'fb_join', source: 'b1', target: 'join' },
          { id: 'f_end', source: 'join', target: 'end' },
        ],
      };
      const result = layout(input);

      for (const flow of input.sequenceFlows) {
        const src = result.shapes[flow.source]!;
        const tgt = result.shapes[flow.target]!;
        expect(src.x + src.width, `Flow ${flow.id} from ${flow.source} to ${flow.target}`).toBeLessThanOrEqual(tgt.x);
      }

      expect(result.shapes.join!.x).toBeGreaterThan(result.shapes.a2!.x + result.shapes.a2!.width);
      expect(result.shapes.join!.x).toBeGreaterThan(result.shapes.b1!.x + result.shapes.b1!.width);
      allOrthogonal(result);
    });

    it('Item 2 regression: empty expanded subprocess retains canonical minimum 120px height', () => {
      let p = createProcess();
      p = addTask(p, { name: 'A' }).process;
      p = wrapInSubprocess(p, [p.nodes.find((n) => n.name === 'A')!.id], { name: 'Empty Sub' }).process;
      const task = p.nodes.find((n) => n.name === 'A')!;
      p.nodes = p.nodes.filter((n) => n.id !== task.id);
      p.flows = [];
      p.regions[0]!.branches[0]!.nodeIds = [];

      const result = layoutProcess(p);
      const sub = p.nodes.find((n) => n.type === 'subProcess')!;
      const subBox = result.shapes[sub.id]!;

      expect(subBox.height).toBeGreaterThanOrEqual(120);
    });

    it('Item 3 regression: long gateway label does not collide with lower branch task', () => {
      const input: LayoutInput = {
        nodes: [
          { id: 'start', type: 'startEvent' },
          { id: 'split', type: 'exclusiveGateway', name: 'Very long gateway question label that occupies substantial horizontal width' },
          { id: 'task1', type: 'task', name: 'Upper task' },
          { id: 'task2', type: 'task', name: 'Lower task' },
        ],
        sequenceFlows: [
          { id: 'f0', source: 'start', target: 'split' },
          { id: 'f1', source: 'split', target: 'task1' },
          { id: 'f2', source: 'split', target: 'task2' },
        ],
      };
      const result = layout(input);
      const gatewayLabel = result.labels.split!;
      const lowerTask = result.shapes.task2!;

      expect(overlaps(gatewayLabel, lowerTask), 'Gateway label overlaps lower task').toBe(false);
      expect(lowerTask.y).toBeGreaterThanOrEqual(gatewayLabel.y + gatewayLabel.height);
      assertNoLabelNodeIntersections(result, input);
    });

    it('Item 4 regression: displaced edge flow label is contained inside lane and pool bounds', () => {
      let p = createProcess();
      p = addPool(p, { name: 'Pool' }).process;
      p = addLane(p, { name: 'Lane 1' }).process;
      for (const name of ['Step 1', 'Step 2']) {
        const after = p.nodes.filter((n) => n.type === 'task').at(-1)?.id;
        p = addTask(p, { name, ...(after ? { after } : {}) }).process;
      }
      p = splitExclusive(p, {
        after: p.nodes.find((n) => n.name === 'Step 2')!.id,
        name: 'Check',
      }).process;

      const flow = p.flows.find((f) => f.name === 'Yes')!;
      flow.name = 'This is an exceptionally long branch label designed to trigger multi-directional collision displacement in the layout engine';

      const result = layoutProcess(p);
      const pool = result.shapes[p.participants[0]!.id]!;
      const lane = result.shapes[p.lanes[0]!.id]!;
      const label = result.labels[flow.id]!;

      expect(label.y, 'Label top above lane top').toBeGreaterThanOrEqual(lane.y);
      expect(label.y + label.height, 'Label bottom below lane bottom').toBeLessThanOrEqual(lane.y + lane.height);
      expect(label.y, 'Label top above pool top').toBeGreaterThanOrEqual(pool.y);
      expect(label.y + label.height, 'Label bottom below pool bottom').toBeLessThanOrEqual(pool.y + pool.height);
    });
  });
});
