import { describe, expect, it } from 'vitest';
import { extractSubgraph, pasteSubgraph } from './clipboard.js';
import { addTask, createProcess, getNode, happyPathIds, splitExclusive } from './index.js';
import type { SemanticProcess } from './types.js';

function named(process: SemanticProcess, name: string): string {
  const node = process.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`no node named ${name}`);
  return node.id;
}

function pathNames(process: SemanticProcess): string[] {
  return happyPathIds(process).map((id) => getNode(process, id).name);
}

describe('semantic clipboard', () => {
  it('copies two tasks and pastes two more nodes on the happy path', () => {
    let process = createProcess();
    process = addTask(process, { name: 'A' }).process;
    process = addTask(process, { name: 'B' }).process;
    const clip = extractSubgraph(process, [named(process, 'A'), named(process, 'B')]);
    expect(clip?.nodes.map((node) => node.name)).toEqual(['A', 'B']);
    const pasted = pasteSubgraph(process, clip!);
    expect(pathNames(pasted.process)).toEqual(['Start', 'A', 'B', 'A', 'B', 'End']);
    expect(pasted.pastedIds).toHaveLength(2);
    expect(pasted.pastedIds.every((id) => id !== named(process, 'A'))).toBe(true);
    expect(pasted.process.nodes.filter((node) => node.name === 'A')).toHaveLength(2);
    expect(pasted.process.nodes.filter((node) => node.name === 'B')).toHaveLength(2);
  });

  it('pastes a copied XOR region as a new split/join, not coordinates', () => {
    let process = createProcess();
    process = addTask(process, { name: 'Review' }).process;
    process = splitExclusive(process, {
      after: named(process, 'Review'),
      name: 'Approved?',
      branches: [{ name: 'Yes' }, { name: 'No' }],
    }).process;
    const yes = process.regions[0]!.branches[0]!;
    const no = process.regions[0]!.branches[1]!;
    process = addTask(process, { name: 'Ship', branchId: yes.id }).process;
    process = addTask(process, { name: 'Reject', branchId: no.id }).process;
    const region = process.regions[0]!;
    const ids = [region.split, region.join, named(process, 'Ship'), named(process, 'Reject')];
    const clip = extractSubgraph(process, ids);
    const pasted = pasteSubgraph(process, clip!);
    expect(pasted.process.regions).toHaveLength(2);
    const names = pasted.process.regions.map((item) =>
      item.branches.map((branch) => branch.nodeIds.map((id) => getNode(pasted.process, id).name)),
    );
    expect(names).toEqual([
      [['Ship'], ['Reject']],
      [['Ship'], ['Reject']],
    ]);
  });

  it('does not copy start or the happy-path end', () => {
    let process = createProcess();
    process = addTask(process, { name: 'A' }).process;
    expect(extractSubgraph(process, [named(process, 'Start'), named(process, 'End')])).toBeNull();
    const clip = extractSubgraph(process, [named(process, 'Start'), named(process, 'A'), named(process, 'End')]);
    expect(clip?.nodes.map((node) => node.name)).toEqual(['A']);
  });
});
