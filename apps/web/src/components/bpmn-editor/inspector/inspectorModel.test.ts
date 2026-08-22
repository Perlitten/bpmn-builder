import { describe, expect, it } from 'vitest';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import {
  NOT_IN_PROFILE,
  attachActions,
  changeToOptions,
  currentComponentId,
  findMatchingReplaceTarget,
  flowNodeLaneAssignment,
  isXorOr,
  outgoingFlowRows,
  lanesInPool,
  matchesReplaceTarget,
  poolLaneCreate,
  toReplaceTarget,
} from './inspectorModel';
import { selectableElement, selectionIdsEqual } from './selectable';
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

  it('keeps a pool header and a lane as the selected id', () => {
    expect(selectableElement({ id: 'Participant_1', type: 'bpmn:Participant' })?.id).toBe('Participant_1');
    expect(selectableElement({ id: 'Lane_1', type: 'bpmn:Lane' })?.id).toBe('Lane_1');
  });

  it('treats the same selected ids as unchanged during a label write', () => {
    expect(selectionIdsEqual(['Participant_1'], ['Participant_1'])).toBe(true);
    expect(selectionIdsEqual(['Participant_1'], ['Lane_1'])).toBe(false);
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

  it('exposes Add lane from the registry only for a selected pool', () => {
    const pool: DiagramElement = { id: 'Participant_1', type: 'bpmn:Participant' };
    const lane: DiagramElement = { id: 'Lane_1', type: 'bpmn:Lane' };
    const created = poolLaneCreate(bpmnComponentRegistry, pool);
    expect(created?.def.id).toBe('participant.lane');
    expect(created?.enabled).toBe(true);
    expect(poolLaneCreate(bpmnComponentRegistry, lane)).toBeUndefined();
    expect(poolLaneCreate(bpmnComponentRegistry, task)).toBeUndefined();
  });

  it('lists top-level lanes of one pool and skips nested or other-pool bands', () => {
    expect(
      lanesInPool(
        [
          { id: 'Lane_1', name: 'Clerk', participantId: 'Participant_1' },
          { id: 'Lane_2', name: 'Manager', participantId: 'Participant_1' },
          { id: 'Lane_3', name: 'Ext', participantId: 'Participant_2' },
          { id: 'Lane_4', name: 'Nested', participantId: 'Participant_1', parentLaneId: 'Lane_1' },
        ],
        'Participant_1',
      ),
    ).toEqual([
      { id: 'Lane_1', name: 'Clerk' },
      { id: 'Lane_2', name: 'Manager' },
    ]);
  });

  it('keeps a blank lane name so the inspector can edit it', () => {
    expect(lanesInPool([{ id: 'Lane_1', name: '', participantId: 'Participant_1' }], 'Participant_1')).toEqual([
      { id: 'Lane_1', name: '' },
    ]);
  });

  it('lists leaf lanes of the node’s pool for assignLane, not a partner pool', () => {
    const graph = {
      id: 'Process_1',
      nodes: [{ id: 'Activity_1' }],
      participants: [
        { id: 'Participant_1', processId: 'Process_1' },
        { id: 'Participant_2', processId: 'Process_2' },
      ],
      processes: [{ id: 'Process_2', nodes: [{ id: 'Activity_ext' }] }],
      lanes: [
        {
          id: 'Lane_1',
          name: 'Clerk',
          participantId: 'Participant_1',
          processId: 'Process_1',
          nodeIds: ['Activity_1'],
        },
        { id: 'Lane_2', name: 'Manager', participantId: 'Participant_1', processId: 'Process_1', nodeIds: [] },
        { id: 'Lane_3', name: 'Ext', participantId: 'Participant_2', processId: 'Process_2', nodeIds: [] },
        {
          id: 'Lane_4',
          name: 'Nested',
          participantId: 'Participant_1',
          processId: 'Process_1',
          parentLaneId: 'Lane_1',
          nodeIds: [],
        },
      ],
    };
    expect(flowNodeLaneAssignment(task, graph)).toEqual({
      lanes: [
        { id: 'Lane_2', name: 'Manager' },
        { id: 'Lane_4', name: 'Nested' },
      ],
    });
    expect(flowNodeLaneAssignment(task, {
      ...graph,
      lanes: graph.lanes.map((lane) => lane.id === 'Lane_1' ? { ...lane, participantId: 'Participant_2', processId: 'Process_2' } : lane),
    })).toEqual({
      lanes: [
        { id: 'Lane_2', name: 'Manager' },
        { id: 'Lane_4', name: 'Nested' },
      ],
    });
    expect(flowNodeLaneAssignment(task, { ...graph, lanes: [] })).toEqual({ lanes: [] });
    expect(flowNodeLaneAssignment({ id: 'Participant_1', type: 'bpmn:Participant' }, graph).lanes).toEqual([]);
    expect(flowNodeLaneAssignment({ id: 'Lane_1', type: 'bpmn:Lane' }, graph).lanes).toEqual([]);
    expect(
      flowNodeLaneAssignment({ id: 'Boundary_1', type: 'bpmn:BoundaryEvent' }, graph).lanes,
    ).toEqual([]);
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

  it('labels XOR outgoing rows with the flow name, not the target id', () => {
    const xor: DiagramElement = {
      id: 'ExclusiveGateway_1',
      type: 'bpmn:ExclusiveGateway',
      outgoing: [
        {
          id: 'SequenceFlow_2',
          type: 'bpmn:SequenceFlow',
          businessObject: { name: 'Yes' },
          target: { id: 'Task_2', type: 'bpmn:Task', businessObject: { name: 'Place order' } },
        },
        {
          id: 'SequenceFlow_4',
          type: 'bpmn:SequenceFlow',
          businessObject: { name: 'No' },
          target: { id: 'ExclusiveGateway_2', type: 'bpmn:ExclusiveGateway' },
        },
      ],
    };
    const rows = outgoingFlowRows(xor);
    expect(rows.map((row) => row.label)).toEqual(['Yes', 'No']);
    expect(rows.every((row) => row.label !== row.id)).toBe(true);
  });
});
