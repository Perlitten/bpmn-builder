import { createProcess } from '@bpmn/semantic-core';
import { executePlan } from '@bpmn/agent-tools';
import { describe, expect, it, vi } from 'vitest';
import { applyAssistantResult } from './applyAssistant';

describe('applyAssistantResult', () => {
  it('applies the returned process graph via layout, never adoptXml', async () => {
    const origin = createProcess();
    const split = executePlan(origin, [
      { name: 'addTask', args: { name: 'Review' } },
      {
        name: 'splitExclusive',
        args: { after: '$last', name: 'Approved?', branches: [{ name: 'Yes' }, { name: 'No' }] },
      },
    ]);
    let current = origin;
    const applyProcess = vi.fn(async (next: ReturnType<typeof createProcess>, _selectId?: string) => {
      current = next;
      return '<layout/>';
    });
    const applyPlan = vi.fn(async () => '<plan/>');
    const adoptXml = vi.fn();
    const result = await applyAssistantResult(
      {
        process: () => current,
        xml: () => '<before/>',
        applyPlan,
        applyProcess,
      },
      {
        message: 'Added an XOR after Review.',
        tools: split.steps.map((step) => ({ name: step.name, args: {} })),
        results: split.steps.map((step) => ({ name: step.name, id: step.id })),
        process: split.process,
        bpmnXml: '<bpmn:definitions>NO</bpmn:definitions>',
      },
    );
    expect(applyProcess).toHaveBeenCalledTimes(1);
    expect(applyProcess.mock.calls[0]?.[1]).toBe(split.id);
    expect(applyPlan).not.toHaveBeenCalled();
    expect(adoptXml).not.toHaveBeenCalled();
    expect(result.xml).toBe('<layout/>');
    expect(result.applied).toBe(true);
    expect(result.diff).toEqual([
      'Added task Review',
      'Added XOR Approved?',
      'Added branch Yes',
      'Added branch No',
    ]);
    expect(result.diff.join('\n')).not.toMatch(/bpmn:|<definitions/i);
  });

  it('replays tools through applyPlan when no process graph is returned', async () => {
    const origin = createProcess();
    const tools = [{ name: 'addTask' as const, args: { name: 'Screen' } }];
    const applyPlan = vi.fn(async () => {
      current = executePlan(current, tools).process;
      return '<plan/>';
    });
    let current = origin;
    const result = await applyAssistantResult(
      {
        process: () => current,
        xml: () => '<before/>',
        applyPlan,
        applyProcess: vi.fn(async () => '<graph/>'),
      },
      { message: 'Added a task.', tools },
    );
    expect(applyPlan).toHaveBeenCalledWith(tools, undefined);
    expect(result.diff).toEqual(['Added task Screen']);
  });

  it('does not replace the graph for inspect/lint-only plans', async () => {
    const applyProcess = vi.fn(async () => '<graph/>');
    const applyPlan = vi.fn(async () => '<plan/>');
    const result = await applyAssistantResult(
      {
        process: () => createProcess(),
        xml: () => '<same/>',
        applyPlan,
        applyProcess,
      },
      {
        message: 'No semantic edits.',
        tools: [{ name: 'lint', args: {} }],
        process: createProcess(),
      },
    );
    expect(applyProcess).not.toHaveBeenCalled();
    expect(applyPlan).not.toHaveBeenCalled();
    expect(result.applied).toBe(false);
    expect(result.diff).toEqual([]);
    expect(result.xml).toBe('<same/>');
  });

  it('does not treat a failed diagram import as applied', async () => {
    const origin = createProcess();
    const next = executePlan(origin, [{ name: 'addTask', args: { name: 'Review' } }]).process;
    const applyProcess = vi.fn(async () => {
      throw new Error("Cannot read properties of undefined (reading 'root-0')");
    });
    await expect(
      applyAssistantResult(
        {
          process: () => origin,
          xml: () => '<before/>',
          applyPlan: vi.fn(async () => '<plan/>'),
          applyProcess,
        },
        {
          message: 'Added Review.',
          tools: [{ name: 'addTask', args: { name: 'Review' } }],
          process: next,
        },
      ),
    ).rejects.toThrow(/root-0/);
    expect(applyProcess).toHaveBeenCalledTimes(1);
  });
});
