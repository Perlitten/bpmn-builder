import { describe, expect, it } from 'vitest';
import { addTask, createProcess, splitExclusive } from '@bpmn/semantic-core';
import { continueTarget, resolveInsert } from './insertTarget';

function withSplit() {
  let process = createProcess();
  process = addTask(process, { name: 'Review' }).process;
  process = splitExclusive(process, {
    after: process.nodes.find((node) => node.name === 'Review')!.id,
    name: 'Approved?',
  }).process;
  const region = process.regions[0]!;
  return { process, splitId: region.split, yes: region.branches[0]!.id };
}

describe('resolveInsert', () => {
  it('blocks catalog create on a split until a branch is named', () => {
    const { process, splitId } = withSplit();
    const xor = { id: splitId, type: 'bpmn:ExclusiveGateway' };
    const at = continueTarget(xor, process);
    expect(at.target).toBeUndefined();
    expect(at.choices.map((choice) => choice.label)).toEqual(['Yes', 'No']);
    expect(resolveInsert(xor, process).blocked).toBe(true);
  });

  it('accepts the branch Continue with picked', () => {
    const { process, splitId, yes } = withSplit();
    const xor = { id: splitId, type: 'bpmn:ExclusiveGateway' };
    const resolved = resolveInsert(xor, process, { branchId: yes });
    expect(resolved.blocked).toBe(false);
    expect(resolved.target).toEqual({ branchId: yes });
  });

  it('inserts on a selected outgoing flow without a branch picker', () => {
    const { process, splitId } = withSplit();
    const flowId = process.flows.find((flow) => flow.source === splitId)!.id;
    const flow = { id: flowId, type: 'bpmn:SequenceFlow' };
    const resolved = resolveInsert(flow, process);
    expect(resolved.blocked).toBe(false);
    expect(resolved.target).toEqual({ onFlow: flowId });
  });
});
