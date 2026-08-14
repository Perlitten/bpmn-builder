import { describe, expect, it } from 'vitest';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import {
  NOT_IN_PROFILE,
  attachActions,
  changeToOptions,
  currentComponentId,
  findMatchingReplaceTarget,
  isXorOr,
  matchesReplaceTarget,
  toReplaceTarget,
} from './inspectorModel';
import { selectableElement } from './selectable';
import type { DiagramElement } from '../diagramElement';

const task: DiagramElement = {
  id: 'Activity_1',
  type: 'bpmn:Task',
  businessObject: { $type: 'bpmn:Task', name: 'Review' },
};

const start: DiagramElement = {
  id: 'StartEvent_1',
  type: 'bpmn:StartEvent',
  businessObject: { $type: 'bpmn:StartEvent', name: 'Start' },
};

describe('selectableElement', () => {
  it('unwraps a label to its target', () => {
    const label = { id: 'Activity_1_label', type: 'label', labelTarget: task };
    expect(selectableElement(label)?.id).toBe('Activity_1');
  });

  it('ignores process and collaboration roots', () => {
    expect(selectableElement({ id: 'Process_1', type: 'bpmn:Process' })).toBeNull();
    expect(selectableElement({ id: 'Collaboration_1', type: 'bpmn:Collaboration' })).toBeNull();
  });
});

describe('inspector model', () => {
  it('maps a task to a replace target and current catalog id', () => {
    expect(toReplaceTarget(task)).toMatchObject({ bpmnType: 'bpmn:Task' });
    expect(currentComponentId(bpmnComponentRegistry, task)).toBe('activity.task');
  });

  it('enables unimplemented replacements when bpmn-js replace works', () => {
    const options = changeToOptions(bpmnComponentRegistry, task, '', () => true);
    const userTask = options.find((entry) => entry.def.id === 'activity.userTask');
    expect(userTask?.enabled).toBe(true);
    expect(userTask?.reason).toBeUndefined();
    expect(options.some((entry) => entry.def.id === 'activity.task')).toBe(false);
  });

  it('greys replacements that bpmn-js cannot apply', () => {
    const options = changeToOptions(bpmnComponentRegistry, task, '', () => false);
    const userTask = options.find((entry) => entry.def.id === 'activity.userTask');
    expect(userTask?.enabled).toBe(false);
    expect(userTask?.reason).toBe(NOT_IN_PROFILE);
  });

  it('search uses the registry and still requires canReplace', () => {
    const hits = changeToOptions(bpmnComponentRegistry, task, 'user', () => true);
    expect(hits.some((entry) => entry.def.id === 'activity.userTask')).toBe(true);
    expect(hits.every((entry) => bpmnComponentRegistry.canReplace(entry.def.id, toReplaceTarget(task)))).toBe(
      true,
    );

    const onStart = changeToOptions(bpmnComponentRegistry, start, 'user', () => true);
    expect(onStart.some((entry) => entry.def.id === 'activity.userTask')).toBe(false);
  });

  it('does not list sequence-flow kinds under Change to', () => {
    const flow: DiagramElement = {
      id: 'Flow_1',
      type: 'bpmn:SequenceFlow',
      source: { id: 'Gateway_1', type: 'bpmn:ExclusiveGateway' },
    };
    const options = changeToOptions(bpmnComponentRegistry, flow, '', () => true);
    expect(options.some((entry) => entry.def.category === 'flows')).toBe(false);
  });

  it('allows timer and error attach on an activity, not on a start event', () => {
    const onTask = attachActions(bpmnComponentRegistry, task);
    expect(onTask.every((entry) => entry.enabled)).toBe(true);
    const onStart = attachActions(bpmnComponentRegistry, start);
    expect(onStart.every((entry) => !entry.enabled)).toBe(true);
  });

  it('matches bpmn-js replace payloads for task and timer start', () => {
    const userTask = bpmnComponentRegistry.get('activity.userTask')!;
    expect(matchesReplaceTarget(userTask, { type: 'bpmn:UserTask' })).toBe(true);
    expect(
      findMatchingReplaceTarget(userTask, [
        { type: 'bpmn:Task' },
        { type: 'bpmn:UserTask' },
        { type: 'bpmn:ServiceTask' },
      ])?.type,
    ).toBe('bpmn:UserTask');

    const timer = bpmnComponentRegistry.get('start.timer')!;
    expect(
      matchesReplaceTarget(timer, {
        type: 'bpmn:StartEvent',
        eventDefinitionType: 'bpmn:TimerEventDefinition',
        isInterrupting: true,
      }),
    ).toBe(true);
    expect(
      matchesReplaceTarget(timer, {
        type: 'bpmn:StartEvent',
        eventDefinitionType: 'bpmn:TimerEventDefinition',
        isInterrupting: false,
      }),
    ).toBe(false);
  });

  it('treats XOR/OR as conditional flow sources', () => {
    expect(isXorOr('bpmn:ExclusiveGateway')).toBe(true);
    expect(isXorOr('bpmn:InclusiveGateway')).toBe(true);
    expect(isXorOr('bpmn:ParallelGateway')).toBe(false);
    expect(
      bpmnComponentRegistry.canCreate('flow.conditional', {
        sourceBpmnType: 'bpmn:ExclusiveGateway',
        parentBpmnType: 'bpmn:Process',
      }),
    ).toBe(true);
    expect(
      bpmnComponentRegistry.canCreate('flow.default', {
        sourceBpmnType: 'bpmn:ParallelGateway',
        parentBpmnType: 'bpmn:Process',
      }),
    ).toBe(false);
  });
});
