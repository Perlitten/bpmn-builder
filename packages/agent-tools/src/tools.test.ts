import { createProcess, getNode, happyPathIds } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { ToolPlanError } from './errors.js';
import { executePlan, executePlanBestEffort, parseToolPlan } from './tools.js';

function pathNames(process: ReturnType<typeof createProcess>): string[] {
  return happyPathIds(process).map((id) => getNode(process, id).name);
}

describe('agent tools', () => {
  it('supports explicit loop connections and keeps successful batch steps', () => {
    const origin = createProcess();
    const first = executePlan(origin, [{ name: 'addTask', args: { name: 'Review quote' } }]);
    const second = executePlan(first.process, [{ name: 'addTask', args: { name: 'Approve quote' } }]);
    const review = second.process.nodes.find((node) => node.name === 'Review quote')!.id;
    const approve = second.process.nodes.find((node) => node.name === 'Approve quote')!.id;
    const plan = executePlanBestEffort(second.process, [
      { name: 'connectSequenceFlow', args: { from: approve, to: review, name: 'Return for edits' } },
      { name: 'renameElement', args: { id: 'Task_404', name: 'Missing' } },
    ]);
    expect(plan.steps).toHaveLength(1);
    expect(plan.failures).toEqual([
      expect.objectContaining({ index: 1, name: 'renameElement', message: expect.stringMatching(/not in this process/i) }),
    ]);
    expect(plan.process.flows.some((flow) => flow.source === approve && flow.target === review)).toBe(true);
  });
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

  it('keeps $last on the previous mutation across inspect and lint steps', () => {
    const plan = executePlan(createProcess(), [
      { name: 'addAfter', args: { after: 'StartEvent_1', name: 'Review' } },
      { name: 'inspectProcess', args: {} },
      { name: 'lint', args: {} },
      { name: 'renameElement', args: { id: '$last', name: 'Approve request' } },
    ]);

    expect(getNode(plan.process, plan.steps[0]!.id).name).toBe('Approve request');
    expect(plan.id).toBe(plan.steps[0]!.id);
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

  it('adds sibling lanes when participantId points at the previous lane', () => {
    const plan = executePlan(createProcess(), [
      { name: 'addLane', args: { name: 'Requester' } },
      { name: 'addLane', args: { participantId: '$last', name: 'Approver' } },
    ]);

    expect(plan.process.participants).toHaveLength(1);
    expect(plan.process.lanes.map((lane) => lane.name)).toEqual(['Requester', 'Approver']);
    expect(new Set(plan.process.lanes.map((lane) => lane.participantId)).size).toBe(1);
  });

  it('reports the failing operation in an atomic batch', () => {
    const origin = createProcess();
    expect(() =>
      executePlan(origin, [
        { name: 'addTask', args: { name: 'Review' } },
        { name: 'renameElement', args: { id: 'Missing', name: 'Approve' } },
        { name: 'addTask', args: { name: 'Archive' } },
      ]),
    ).toThrow('Step 2 (renameElement) failed: That element is not in this process.');
    expect(origin.nodes.map((node) => node.id)).toEqual(['StartEvent_1', 'EndEvent_1']);
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
    ).toThrow(/cannot be added here/);
    const added = executePlan(origin, [{ name: 'addTask', args: { componentId: 'activity.userTask' } }]);
    expect(getNode(added.process, added.id).bpmnType).toBe('bpmn:UserTask');
  });

  it('assignLane moves a task between lanes and refuses a boundary event', () => {
    const origin = createProcess({ name: 'Clerk' });
    const pooled = executePlan(origin, [
      { name: 'addTask', args: { name: 'Review' } },
      { name: 'addLane', args: { name: 'Clerk' } },
      { name: 'addLane', args: { name: 'Manager' } },
    ]);
    const clerk = pooled.process.lanes[0]!;
    const manager = pooled.process.lanes[1]!;
    const review = pooled.process.nodes.find((n) => n.name === 'Review')!;
    expect(clerk.nodeIds).toContain(review.id);

    const moved = executePlan(pooled.process, [
      { name: 'assignLane', args: { nodeId: review.id, laneId: manager.id } },
    ]);
    expect(moved.process.lanes[0]!.nodeIds).not.toContain(review.id);
    expect(moved.process.lanes[1]!.nodeIds).toContain(review.id);
    expect(moved.inverse(moved.process)).toEqual(pooled.process);

    const timed = executePlan(pooled.process, [{ name: 'attachBoundaryTimer', args: { on: review.id } }]);
    expect(() =>
      executePlan(timed.process, [{ name: 'assignLane', args: { nodeId: timed.id, laneId: manager.id } }]),
    ).toThrow(/attach to an activity, not a lane/i);
  });

  it('catalog tools create via registry ids, not a private type list', () => {
    const origin = createProcess();
    const withTask = executePlan(origin, [{ name: 'addTask', args: { name: 'Review' } }]);

    const errBound = executePlan(withTask.process, [
      { name: 'attachBoundaryError', args: { on: 'Review', name: 'Claim failed' } },
    ]);
    expect(getNode(errBound.process, errBound.id).eventDefinition).toBe('ErrorEventDefinition');
    expect(errBound.inverse(errBound.process)).toEqual(withTask.process);

    const viaCreate = executePlan(withTask.process, [
      { name: 'createComponent', args: { componentId: 'boundary.error', after: 'Review' } },
    ]);
    expect(getNode(viaCreate.process, viaCreate.id).type).toBe('boundaryEvent');

    const catchTimer = executePlan(withTask.process, [
      { name: 'createComponent', args: { componentId: 'intermediate.catch.timer', after: 'Review', name: 'Wait SLA' } },
    ]);
    expect(getNode(catchTimer.process, catchTimer.id)).toMatchObject({
      type: 'intermediateCatch',
      eventDefinition: 'TimerEventDefinition',
    });

    const startMsg = executePlan(origin, [{ name: 'createComponent', args: { componentId: 'start.message' } }]);
    expect(getNode(startMsg.process, 'StartEvent_1').eventDefinition).toBe('MessageEventDefinition');

    const endErr = executePlan(origin, [{ name: 'createComponent', args: { componentId: 'end.error' } }]);
    expect(getNode(endErr.process, 'EndEvent_1').eventDefinition).toBe('ErrorEventDefinition');

    const tx = executePlan(withTask.process, [
      { name: 'createComponent', args: { componentId: 'activity.transaction', after: 'Review', name: 'Settle' } },
    ]);
    expect(getNode(tx.process, tx.id).bpmnType).toBe('bpmn:Transaction');

    const adHoc = executePlan(withTask.process, [
      { name: 'createComponent', args: { componentId: 'activity.adHocSubProcess', after: 'Review', name: 'Ad hoc' } },
    ]);
    expect(getNode(adHoc.process, adHoc.id).bpmnType).toBe('bpmn:AdHocSubProcess');

    const call = executePlan(origin, [{ name: 'addTask', args: { name: 'Call claims', componentId: 'activity.callActivity' } }]);
    const named = executePlan(call.process, [
      { name: 'setCalledElement', args: { id: call.id, calledElement: 'Process_Claims' } },
    ]);
    expect(getNode(named.process, call.id).calledElement).toBe('Process_Claims');

    const eventSub = executePlan(origin, [{ name: 'createEventSubprocess', args: { name: 'On error' } }]);
    expect(getNode(eventSub.process, eventSub.id).type).toBe('subProcess');

    const compensation = executePlan(withTask.process, [
      { name: 'createComponent', args: { componentId: 'boundary.compensation', after: 'Review' } },
    ]);
    expect(getNode(compensation.process, compensation.id).eventDefinition).toBe('CompensateEventDefinition');
  });

  it('splitComplex, setFlowKind, and artifacts are first-class tools', () => {
    const origin = createProcess();
    const withTask = executePlan(origin, [{ name: 'addTask', args: { name: 'Score' } }]);
    const split = executePlan(withTask.process, [
      { name: 'splitComplex', args: { after: 'Score', name: 'Route', branches: [{ name: 'A' }, { name: 'B' }] } },
    ]);
    expect(split.process.regions[0]!.type).toBe('complex');
    expect(getNode(split.process, split.process.regions[0]!.split).type).toBe('complexGateway');
    expect(split.inverse(split.process)).toEqual(withTask.process);

    const viaCreate = executePlan(withTask.process, [
      { name: 'createComponent', args: { componentId: 'gateway.complex', after: 'Score' } },
    ]);
    expect(viaCreate.process.regions[0]!.type).toBe('complex');

    const cond = executePlan(withTask.process, [
      { name: 'setFlowKind', args: { flowId: 'SequenceFlow_1', kind: 'conditional', condition: '${ok}' } },
    ]);
    expect(cond.process.flows.find((f) => f.id === 'SequenceFlow_1')).toMatchObject({
      condition: '${ok}',
      isDefault: false,
    });

    const data = executePlan(origin, [
      { name: 'addDataObject', args: { name: 'Claim' } },
      { name: 'addDataStore', args: { name: 'Claims DB' } },
      { name: 'addTextAnnotation', args: { text: 'Note', associateTo: 'StartEvent_1' } },
      { name: 'addGroup', args: { name: 'Pack' } },
    ]);
    const types = (data.process.artifacts ?? []).map((item) => String(item.$type));
    expect(types).toEqual(
      expect.arrayContaining([
        'bpmn:DataObjectReference',
        'bpmn:DataStoreReference',
        'bpmn:TextAnnotation',
        'bpmn:Association',
        'bpmn:Group',
      ]),
    );
    const note = (data.process.artifacts ?? []).find((item) => String(item.$type).endsWith('TextAnnotation'))!;
    const extra = executePlan(data.process, [
      { name: 'addAssociation', args: { from: String(note.id), to: 'EndEvent_1' } },
    ]);
    expect((extra.process.artifacts ?? []).filter((item) => String(item.$type).endsWith('Association')).length).toBe(2);

    const viaRegistry = executePlan(origin, [
      { name: 'createComponent', args: { componentId: 'data.object', name: 'Folder' } },
    ]);
    expect((viaRegistry.process.artifacts ?? []).some((item) => item.name === 'Folder')).toBe(true);
  });
});
