import { executePlan } from '@bpmn/agent-tools';
import { createProcess } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { buildAssistantScope, resolveAgentContext, scopeOptionEnabled } from './agentScope';

describe('architect agent scope', () => {
  it('resolves current region / branch from a selected node', () => {
    const process = executePlan(createProcess(), [
      { name: 'addTask', args: { name: 'Review' } },
      { name: 'splitExclusive', args: { after: 'Review' } },
      { name: 'addTask', args: { name: 'Handle yes', branchId: 'Yes' } },
    ]).process;
    const yes = process.regions[0]!.branches[0]!;
    const handleYes = process.nodes.find((n) => n.name === 'Handle yes')!.id;
    const ctx = resolveAgentContext(process, [handleYes]);
    expect(ctx.regionId).toBe(process.regions[0]!.id);
    expect(ctx.branchId).toBe(yes.id);
    expect(ctx.branchLocked).toBe(false);
    expect(scopeOptionEnabled('branch', ctx)).toBe(true);
    expect(buildAssistantScope('branch', ctx)).toEqual({ kind: 'branch', id: yes.id });
    expect(buildAssistantScope('selection', ctx)).toEqual({ kind: 'selection', ids: [handleYes] });
  });

  it('falls back to whole process when the requested scope is missing', () => {
    const ctx = resolveAgentContext(createProcess(), []);
    expect(scopeOptionEnabled('region', ctx)).toBe(false);
    expect(scopeOptionEnabled('selection', ctx)).toBe(false);
    expect(buildAssistantScope('branch', ctx)).toEqual({ kind: 'process' });
  });
});
