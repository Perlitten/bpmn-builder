import { createProcess, getNode, happyPathIds, setBranchLocked } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { ToolPlanError } from './errors.js';
import { parseAgentScope } from './scope.js';
import { executePlan } from './tools.js';

function xorProcess() {
  return executePlan(createProcess(), [
    { name: 'addTask', args: { name: 'Review' } },
    { name: 'splitExclusive', args: { after: 'Review', branches: [{ name: 'Yes' }, { name: 'No' }] } },
    { name: 'addTask', args: { name: 'Handle yes', branchId: 'Yes' } },
    { name: 'addTask', args: { name: 'Handle no', branchId: 'No' } },
  ]).process;
}

describe('agent scope and branch lock', () => {
  it('parseAgentScope accepts the four kinds', () => {
    expect(parseAgentScope(undefined)).toBeUndefined();
    expect(parseAgentScope({ kind: 'process' })).toEqual({ kind: 'process' });
    expect(parseAgentScope({ kind: 'region', id: 'Region_1' })).toEqual({ kind: 'region', id: 'Region_1' });
    expect(parseAgentScope({ kind: 'branch', id: 'Branch_1' })).toEqual({ kind: 'branch', id: 'Branch_1' });
    expect(parseAgentScope({ kind: 'selection', ids: ['Task_1'] })).toEqual({ kind: 'selection', ids: ['Task_1'] });
    expect(() => parseAgentScope({ kind: 'board' })).toThrow(ToolPlanError);
    expect(() => parseAgentScope({ kind: 'branch' })).toThrow(/scope.id/);
    expect(() => parseAgentScope({ kind: 'selection', ids: [] })).toThrow(/scope.ids/);
  });

  it('refuses mutations on a branch protected from AI', () => {
    let p = xorProcess();
    const no = p.regions[0]!.branches[1]!;
    p = setBranchLocked(p, no.id, true).process;
    const handleNo = p.nodes.find((n) => n.name === 'Handle no')!.id;

    expect(() =>
      executePlan(p, [{ name: 'addAfter', args: { after: handleNo, name: 'Blocked' } }]),
    ).toThrow(/protected from AI/);
    expect(() => executePlan(p, [{ name: 'renameElement', args: { id: handleNo, name: 'Nope' } }])).toThrow(
      /protected from AI/,
    );
    expect(() => executePlan(p, [{ name: 'removeElement', args: { id: handleNo } }])).toThrow(/protected from AI/);
    expect(() => executePlan(p, [{ name: 'addTask', args: { name: 'Blocked', branchId: no.id } }])).toThrow(
      /protected from AI/,
    );

    const inspect = executePlan(p, [{ name: 'inspectBranch', args: { branchId: no.id } }]);
    expect(inspect.process).toBe(p);
    expect((inspect.steps[0]!.view as { branch: { locked?: boolean } }).branch.locked).toBe(true);
  });

  it('allows mutations on an unlocked sibling when another branch is locked', () => {
    let p = xorProcess();
    const yes = p.regions[0]!.branches[0]!;
    const no = p.regions[0]!.branches[1]!;
    p = setBranchLocked(p, no.id, true).process;
    const next = executePlan(p, [{ name: 'addTask', args: { name: 'More yes', branchId: yes.id } }]);
    expect(getNode(next.process, next.id).name).toBe('More yes');
    expect(next.process.regions[0]!.branches[1]!.locked).toBe(true);
    expect(next.process.regions[0]!.branches[1]!.nodeIds.map((id) => getNode(next.process, id).name)).toEqual([
      'Handle no',
    ]);
  });

  it('refuses mutations outside current branch scope', () => {
    const p = xorProcess();
    const yes = p.regions[0]!.branches[0]!;
    const handleNo = p.nodes.find((n) => n.name === 'Handle no')!.id;
    const handleYes = p.nodes.find((n) => n.name === 'Handle yes')!.id;
    const scope = { kind: 'branch' as const, id: yes.id };

    expect(() =>
      executePlan(p, [{ name: 'addAfter', args: { after: handleNo, name: 'Blocked' } }], { scope }),
    ).toThrow(/outside agent scope|protected from AI/);
    expect(() => executePlan(p, [{ name: 'renameElement', args: { id: handleNo, name: 'Nope' } }], { scope })).toThrow(
      /outside agent scope/,
    );

    const added = executePlan(p, [{ name: 'addAfter', args: { after: handleYes, name: 'More yes' } }], { scope });
    expect(getNode(added.process, added.id).name).toBe('More yes');
    expect(added.process.regions[0]!.branches[1]!.nodeIds).toEqual(p.regions[0]!.branches[1]!.nodeIds);
  });

  it('refuses mutations outside current region scope', () => {
    const p = xorProcess();
    const region = p.regions[0]!;
    const review = p.nodes.find((n) => n.name === 'Review')!.id;
    const handleYes = p.nodes.find((n) => n.name === 'Handle yes')!.id;
    const scope = { kind: 'region' as const, id: region.id };

    expect(() => executePlan(p, [{ name: 'addAfter', args: { after: review, name: 'Before split' } }], { scope })).toThrow(
      /outside agent scope/,
    );
    const added = executePlan(p, [{ name: 'addAfter', args: { after: handleYes, name: 'Inside' } }], { scope });
    expect(getNode(added.process, added.id).name).toBe('Inside');
  });

  it('refuses mutations outside selection scope', () => {
    const p = xorProcess();
    const handleYes = p.nodes.find((n) => n.name === 'Handle yes')!.id;
    const handleNo = p.nodes.find((n) => n.name === 'Handle no')!.id;
    const scope = { kind: 'selection' as const, ids: [handleYes] };

    expect(() => executePlan(p, [{ name: 'renameElement', args: { id: handleNo, name: 'Nope' } }], { scope })).toThrow(
      /outside agent scope/,
    );
    const renamed = executePlan(p, [{ name: 'renameElement', args: { id: handleYes, name: 'Approved work' } }], {
      scope,
    });
    expect(getNode(renamed.process, handleYes).name).toBe('Approved work');
    expect(getNode(renamed.process, handleNo).name).toBe('Handle no');
  });

  it('addTask with no placement stays on the scoped branch', () => {
    const p = xorProcess();
    const yes = p.regions[0]!.branches[0]!;
    const added = executePlan(p, [{ name: 'addTask', args: { name: 'Tail' } }], {
      scope: { kind: 'branch', id: yes.id },
    });
    expect(added.process.regions[0]!.branches[0]!.nodeIds.map((id) => getNode(added.process, id).name)).toEqual([
      'Handle yes',
      'Tail',
    ]);
    expect(added.process.regions[0]!.branches[1]!.nodeIds).toEqual(p.regions[0]!.branches[1]!.nodeIds);
  });

  it('addTask with branch: Region_1 maps instead of throwing', () => {
    const p = xorProcess();
    const region = p.regions[0]!;
    const added = executePlan(
      p,
      [{ name: 'addTask', args: { name: 'Register customer', branch: region.id } }],
      { scope: { kind: 'process' } },
    );
    expect(getNode(added.process, added.id).name).toBe('Register customer');
    const next = added.process.regions[0]!;
    expect(next.branches.flatMap((branch) => branch.nodeIds)).not.toContain(added.id);
    expect(happyPathIds(added.process)).toContain(added.id);
  });

  it('whole-process scope addTask does not require a branch', () => {
    const p = xorProcess();
    const added = executePlan(p, [{ name: 'addTask', args: { name: 'Age check' } }], {
      scope: { kind: 'process' },
    });
    expect(getNode(added.process, added.id).name).toBe('Age check');
    expect(added.process.regions[0]!.branches.map((branch) => [...branch.nodeIds])).toEqual(
      p.regions[0]!.branches.map((branch) => [...branch.nodeIds]),
    );
  });

  it('addTask after splitExclusive with $last region maps on whole-process scope', () => {
    const origin = createProcess();
    const plan = executePlan(
      origin,
      [
        { name: 'addTask', args: { name: 'Review' } },
        { name: 'splitExclusive', args: { after: 'Review', branches: [{ name: 'Yes' }, { name: 'No' }] } },
        { name: 'addTask', args: { name: 'Register', branchId: '$last' } },
      ],
      { scope: { kind: 'process' } },
    );
    expect(getNode(plan.process, plan.id).name).toBe('Register');
    expect(plan.process.regions[0]!.branches.flatMap((branch) => branch.nodeIds)).not.toContain(plan.id);
  });

  it('region scope maps addTask branch: Region_1 onto the happy branch', () => {
    const p = xorProcess();
    const region = p.regions[0]!;
    const added = executePlan(
      p,
      [{ name: 'addTask', args: { name: 'Inside xor', branch: region.id } }],
      { scope: { kind: 'region', id: region.id } },
    );
    expect(added.process.regions[0]!.branches[0]!.nodeIds.map((id) => getNode(added.process, id).name)).toEqual([
      'Handle yes',
      'Inside xor',
    ]);
  });

  it('addTask after: Region_1 inserts after the join', () => {
    const p = xorProcess();
    const region = p.regions[0]!;
    const added = executePlan(p, [{ name: 'addTask', args: { name: 'After xor', after: region.id } }], {
      scope: { kind: 'process' },
    });
    expect(happyPathIds(added.process).slice(-3)).toEqual([region.join, added.id, 'EndEvent_1']);
  });

  it('unknown branch still fails with a BPMN sentence, not a kernel dump', () => {
    const p = xorProcess();
    expect(() =>
      executePlan(p, [{ name: 'addTask', args: { name: 'Nope', branchId: 'Branch_999' } }], {
        scope: { kind: 'region', id: p.regions[0]!.id },
      }),
    ).toThrow(/gateway branch|not in this process/i);
    expect(() =>
      executePlan(p, [{ name: 'addTask', args: { name: 'Nope', branchId: 'Branch_999' } }], {
        scope: { kind: 'region', id: p.regions[0]!.id },
      }),
    ).not.toThrow(/unknown branch: Branch_999/);
  });
});
