import { createProcess, getNode, happyPathIds } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { ToolPlanError } from './errors.js';
import { executePlan, parseToolPlan } from './tools.js';

function pathNames(process: ReturnType<typeof createProcess>): string[] {
  return happyPathIds(process).map((id) => getNode(process, id).name);
}

describe('agent tools', () => {
  it('addAfter inserts a task and is undoable', () => {
    const origin = createProcess({ name: 'Linear' });
    const plan = executePlan(origin, [{ name: 'addAfter', args: { after: 'StartEvent_1', name: 'Review' } }]);
    expect(pathNames(plan.process)).toEqual(['Start', 'Review', 'End']);
    expect(plan.id).toBe('Task_1');
    expect(getNode(plan.process, plan.id).bpmnType).toBe('bpmn:Task');
    expect(plan.inverse(plan.process)).toEqual(origin);
    expect(origin.nodes.map((n) => n.id)).toEqual(['StartEvent_1', 'EndEvent_1']);
  });

  it('splitExclusive creates a join and is undoable', () => {
    let p = createProcess();
    const added = executePlan(p, [{ name: 'addTask', args: { name: 'A' } }]);
    p = added.process;
    const split = executePlan(p, [
      { name: 'splitExclusive', args: { after: 'A', name: 'Approved?', branches: [{ name: 'Yes' }, { name: 'No' }] } },
    ]);
    expect(split.process.regions).toHaveLength(1);
    const region = split.process.regions[0]!;
    expect(split.id).toBe(region.id);
    expect(getNode(split.process, region.split).type).toBe('exclusiveGateway');
    expect(getNode(split.process, region.join).type).toBe('exclusiveGateway');
    expect(region.split).not.toBe(region.join);
    expect(region.branches.map((b) => b.name)).toEqual(['Yes', 'No']);
    expect(split.inverse(split.process)).toEqual(p);
  });

  it('splitParallel and attachBoundaryTimer are first-slice tools', () => {
    const origin = createProcess();
    const withTask = executePlan(origin, [{ name: 'addTask', args: { name: 'Review' } }]);
    const and = executePlan(withTask.process, [{ name: 'splitParallel', args: { after: 'Review' } }]);
    expect(and.process.regions[0]!.type).toBe('parallel');
    expect(getNode(and.process, and.process.regions[0]!.split).type).toBe('parallelGateway');
    expect(getNode(and.process, and.process.regions[0]!.join).type).toBe('parallelGateway');

    const timed = executePlan(withTask.process, [{ name: 'attachBoundaryTimer', args: { on: 'Review', name: 'SLA' } }]);
    expect(timed.process.feedback[0]?.exceptionBranch).toBe(true);
    expect(timed.process.exceptionBranches[0]?.hostId).toBe(withTask.id);
    expect(getNode(timed.process, timed.id).type).toBe('boundaryEvent');
  });

  it('executePlan addAfter then splitExclusive with $last', () => {
    const origin = createProcess();
    const plan = executePlan(origin, [
      { name: 'addAfter', args: { after: 'StartEvent_1', name: 'Check', componentId: 'activity.userTask' } },
      { name: 'splitExclusive', args: { after: '$last' } },
      { name: 'addTask', args: { name: 'Handle yes', branchId: 'Yes' } },
    ]);
    expect(getNode(plan.process, plan.steps[0]!.id).bpmnType).toBe('bpmn:UserTask');
    expect(plan.process.regions[0]!.branches[0]!.nodeIds.map((id) => getNode(plan.process, id).name)).toEqual([
      'Handle yes',
    ]);
    expect(plan.inverse(plan.process)).toEqual(origin);
  });

  it('lint returns @bpmn/rules findings without mutating', () => {
    const origin = createProcess();
    const withTask = executePlan(origin, [{ name: 'addTask', args: { name: 'Customer record' } }]).process;
    const linted = executePlan(withTask, [{ name: 'lint', args: {} }]);
    expect(linted.process).toBe(withTask);
    const view = linted.steps[0]!.view as { style: Array<{ id: string }> };
    expect(view.style.some((f) => f.id === 'style.task-verb')).toBe(true);
  });

  it('rejects coordinates, DI, and BPMN XML in tool args', () => {
    expect(() => parseToolPlan([{ name: 'addTask', args: { name: 'A', x: 120, y: 80 } }])).toThrow(ToolPlanError);
    expect(() =>
      parseToolPlan([{ name: 'addAfter', args: { after: 'StartEvent_1', waypoints: [{ x: 1, y: 2 }] } }]),
    ).toThrow(/coordinates or DI/);
    expect(() =>
      parseToolPlan([
        {
          name: 'addTask',
          args: { name: '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"/>' },
        },
      ]),
    ).toThrow(/BPMN XML/);
    expect(() => parseToolPlan([{ name: 'replaceXml', args: { bpmnXml: '<xml/>' } }])).toThrow(/unknown tool/);
  });

  it('addPool / addLane / addMessageInteraction are first-slice tools', () => {
    const origin = createProcess({ name: 'Clerk' });
    const pooled = executePlan(origin, [
      { name: 'addTask', args: { name: 'Review' } },
      { name: 'addPool', args: { name: 'Partner' } },
    ]);
    expect(pooled.process.participants).toHaveLength(2);
    expect(pooled.id).toBe(pooled.process.participants[1]!.id);
    const host = pooled.process.participants[0]!.id;
    const partner = pooled.process.participants[1]!.id;
    const next = executePlan(pooled.process, [
      { name: 'addLane', args: { participantId: host, name: 'Ops' } },
      { name: 'addMessageInteraction', args: { from: host, to: partner, name: 'Ask' } },
    ]);
    expect(next.process.lanes[0]!.name).toBe('Ops');
    expect(next.process.messageFlows[0]).toMatchObject({ source: host, target: partner, name: 'Ask' });
    expect(next.inverse(next.process)).toEqual(pooled.process);
  });

  it('addTask branch alias accepts a region id after splitExclusive', () => {
    const origin = createProcess();
    const split = executePlan(origin, [
      { name: 'addTask', args: { name: 'Review' } },
      { name: 'splitExclusive', args: { after: 'Review' } },
    ]);
    const added = executePlan(split.process, [
      { name: 'addTask', args: { name: 'Register', branch: split.process.regions[0]!.id } },
    ]);
    expect(getNode(added.process, added.id).name).toBe('Register');
    expect(pathNames(added.process)).toContain('Register');
  });

  it('addTask componentId uses BpmnComponentRegistry ids only', () => {
    const origin = createProcess();
    expect(() =>
      executePlan(origin, [{ name: 'addTask', args: { componentId: 'event.start.none' } }]),
    ).toThrow(/unknown component/);
    const added = executePlan(origin, [{ name: 'addTask', args: { componentId: 'activity.userTask' } }]);
    expect(getNode(added.process, added.id).bpmnType).toBe('bpmn:UserTask');
  });
});
