import { describe, expect, it } from 'vitest';
import { createFromComponent } from './create.js';
import { allRegions, branchTargetsAfter, getFlow, insertionFlow, outgoingFlows } from './graph.js';
import { addOnFlow, addTask, createProcess, splitExclusive } from './ops.js';
import type { Process } from './types.js';

/** Start → Review → XOR split (Yes/No) → XOR join → End, the shape the stress test hit. */
function withSplit(): { process: Process; splitId: string; yes: string; no: string } {
  let process = createProcess();
  process = addTask(process, { name: 'Review' }).process;
  process = splitExclusive(process, {
    after: process.nodes.find((node) => node.name === 'Review')!.id,
    name: 'Approved?',
  }).process;
  const region = process.regions[0]!;
  return { process, splitId: region.split, yes: region.branches[0]!.id, no: region.branches[1]!.id };
}

const names = (process: Process, ids: string[]) =>
  ids.map((id) => process.nodes.find((node) => node.id === id)!.name);

describe('create into a gateway branch', () => {
  it('inserts a task on the named branch instead of failing as ambiguous', () => {
    const { process, splitId, yes, no } = withSplit();
    const applied = createFromComponent(process, 'activity.task', {
      after: splitId,
      branchId: yes,
      name: 'Notify',
    });
    const region = applied.process.regions[0]!;
    expect(names(applied.process, region.branches[0]!.nodeIds)).toEqual(['Notify']);
    expect(region.branches[1]!.nodeIds).toEqual([]);
    expect(no).toBeTruthy();
    expect(applied.process.nodes.some((node) => node.id === applied.id)).toBe(true);
  });

  it('keeps the raw ambiguity error and leaves the process untouched without a branch', () => {
    const { process, splitId } = withSplit();
    expect(() => createFromComponent(process, 'activity.task', { after: splitId })).toThrow(
      /ambiguous after/i,
    );
    expect(process.nodes.filter((node) => node.type === 'task')).toHaveLength(1);
  });

  it('inserts a gateway split and a subprocess into a branch too', () => {
    const { process, splitId, no } = withSplit();
    const nested = createFromComponent(process, 'gateway.exclusive', {
      after: splitId,
      branchId: no,
      name: 'Retry?',
    });
    const inner = allRegions(nested.process).find((region) => region.split !== splitId)!;
    expect(allRegions(nested.process)).toHaveLength(2);
    expect(nested.process.nodes.find((node) => node.id === inner.split)?.name).toBe('Retry?');
    expect(nested.process.regions[0]!.nested.map((region) => region.id)).toContain(inner.id);

    const sub = createFromComponent(process, 'activity.subProcess', { after: splitId, branchId: no });
    expect(sub.process.nodes.find((node) => node.id === sub.id)?.type).toBe('subProcess');
  });

  it('lists one branch target per outgoing flow with branch names', () => {
    const { process, splitId, yes, no } = withSplit();
    const targets = branchTargetsAfter(process, splitId);
    expect(targets.map((target) => target.label)).toEqual(['Yes', 'No']);
    expect(targets.map((target) => target.branchId)).toEqual([yes, no]);
    expect(targets.map((target) => target.flowId)).toEqual(
      outgoingFlows(process, splitId).map((flow) => flow.id),
    );
    expect(branchTargetsAfter(process, 'StartEvent_1')).toHaveLength(1);
  });
});

describe('create on a selected sequence flow', () => {
  it('splits that flow, even when the source has several outgoing flows', () => {
    const { process, splitId } = withSplit();
    const noFlow = outgoingFlows(process, splitId)[1]!;
    const applied = createFromComponent(process, 'activity.task', { onFlow: noFlow.id, name: 'Reject' });
    const region = applied.process.regions[0]!;
    expect(names(applied.process, region.branches[1]!.nodeIds)).toEqual(['Reject']);
    expect(getFlow(applied.process, noFlow.id).target).toBe(applied.id);
  });

  it('splits a flow between two tasks and keeps the order', () => {
    let process = createProcess();
    process = addTask(process, { name: 'A' }).process;
    process = addTask(process, { name: 'B' }).process;
    const between = process.flows.find(
      (flow) =>
        flow.source === process.nodes.find((node) => node.name === 'A')!.id &&
        flow.target === process.nodes.find((node) => node.name === 'B')!.id,
    )!;
    const applied = addOnFlow(process, between.id, { name: 'Middle' });
    expect(getFlow(applied.process, between.id).target).toBe(applied.id);
    expect(applied.process.flows.some((flow) => flow.source === applied.id)).toBe(true);
  });

  it('rejects an unknown flow instead of guessing a target', () => {
    const { process } = withSplit();
    expect(() => addOnFlow(process, 'SequenceFlow_404', {})).toThrow(/unknown flow/i);
  });

  it('resolves the insertion flow from a flow, a branch, or a node', () => {
    const { process, splitId, yes } = withSplit();
    const [yesFlow] = outgoingFlows(process, splitId);
    expect(insertionFlow(process, { onFlow: yesFlow!.id }).id).toBe(yesFlow!.id);
    expect(insertionFlow(process, { branchId: yes }).id).toBe(yesFlow!.id);
    expect(insertionFlow(process, { after: 'StartEvent_1' }).source).toBe('StartEvent_1');
  });
});
