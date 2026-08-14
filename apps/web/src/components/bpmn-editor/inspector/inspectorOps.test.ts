import { describe, expect, it, vi } from 'vitest';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import type { DiagramElement } from '../diagramElement';
import {
  applyFlowKind,
  applyViewerLabel,
  attachBoundary,
  canDeleteElement,
  canReplaceWithBpmnJs,
  deleteSelection,
  renameElement,
  replaceElement,
  setCondition,
  setDefaultOutgoing,
} from './inspectorOps';

function mockModeler(element: DiagramElement, extras: Record<string, unknown> = {}) {
  const modeling = {
    updateLabel: vi.fn(),
    updateProperties: vi.fn(),
    removeElements: vi.fn(),
    createShape: vi.fn(),
  };
  const graphicsFactory = { update: vi.fn() };
  const bpmnReplace = { replaceElement: vi.fn() };
  const elementFactory = { createShape: vi.fn((attrs) => ({ ...attrs })) };
  const bpmnFactory = { create: vi.fn((type, attrs) => ({ $type: type, ...attrs })) };
  const editorActions = { trigger: vi.fn() };
  const rules = { allowed: vi.fn(() => true) };
  const gfx = { id: 'gfx' };
  const services: Record<string, unknown> = {
    elementRegistry: {
      get: (id: string) => (id === element.id ? element : extras[id]),
      getGraphics: () => gfx,
    },
    modeling,
    graphicsFactory,
    bpmnReplace,
    elementFactory,
    bpmnFactory,
    editorActions,
    rules,
    ...extras,
  };
  return {
    get: (name: string) => services[name],
    modeling,
    graphicsFactory,
    bpmnReplace,
    elementFactory,
    bpmnFactory,
    editorActions,
    rules,
  };
}

const task: DiagramElement = {
  id: 'Activity_1',
  type: 'bpmn:Task',
  x: 270,
  y: 80,
  width: 100,
  height: 80,
  businessObject: { $type: 'bpmn:Task', name: 'Task' },
};

describe('inspector ops', () => {
  it('replaces via bpmn-js when a payload exists and rules allow it', () => {
    const modeler = mockModeler(task);
    const userTask = bpmnComponentRegistry.get('activity.userTask')!;
    expect(canReplaceWithBpmnJs(modeler, task, userTask)).toBe(true);
    replaceElement(modeler, task.id, userTask);
    expect(modeler.bpmnReplace.replaceElement).toHaveBeenCalledWith(task, { type: 'bpmn:UserTask' });
  });

  it('renames, deletes, and attaches a timer on an activity', () => {
    const modeler = mockModeler(task);
    renameElement(modeler, task.id, 'Review request');
    expect(modeler.modeling.updateLabel).toHaveBeenCalledWith(task, 'Review request');
    expect(modeler.graphicsFactory.update).toHaveBeenCalledWith('shape', task, { id: 'gfx' });

    expect(canDeleteElement(modeler, task)).toBe(true);
    deleteSelection(modeler);
    expect(modeler.editorActions.trigger).toHaveBeenCalledWith('removeSelection');

    const timer = bpmnComponentRegistry.get('boundary.timer')!;
    attachBoundary(modeler, task.id, timer);
    expect(modeler.elementFactory.createShape).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bpmn:BoundaryEvent',
        eventDefinitionType: 'bpmn:TimerEventDefinition',
      }),
    );
    expect(modeler.modeling.createShape).toHaveBeenCalledWith(
      expect.anything(),
      { x: 320, y: 160 },
      task,
      { attach: true },
    );
  });

  it('sets default and conditional on XOR outgoing flows', () => {
    const gateway: DiagramElement = {
      id: 'Gateway_1',
      type: 'bpmn:ExclusiveGateway',
      businessObject: { $type: 'bpmn:ExclusiveGateway' },
    };
    const flow: DiagramElement = {
      id: 'Flow_1',
      type: 'bpmn:SequenceFlow',
      source: gateway,
      businessObject: { $type: 'bpmn:SequenceFlow' },
    };
    const modeler = mockModeler(flow, { Gateway_1: gateway, Flow_1: flow });
    const conditional = bpmnComponentRegistry.get('flow.conditional')!;
    expect(canReplaceWithBpmnJs(modeler, flow, conditional)).toBe(true);

    applyFlowKind(modeler, flow.id, 'default');
    expect(modeler.modeling.updateProperties).toHaveBeenCalledWith(gateway, { default: flow.businessObject });

    setCondition(modeler, flow.id, '${approved}');
    expect(modeler.bpmnFactory.create).toHaveBeenCalledWith('bpmn:FormalExpression', { body: '${approved}' });

    setDefaultOutgoing(modeler, gateway.id, flow.id);
    expect(modeler.modeling.updateProperties).toHaveBeenCalledWith(gateway, { default: flow.businessObject });
  });

  it('repaints a pool label without waiting for a second import', () => {
    const pool: DiagramElement = {
      id: 'Participant_1',
      type: 'bpmn:Participant',
      businessObject: { $type: 'bpmn:Participant', name: 'Pool' },
    };
    const modeler = mockModeler(pool);
    applyViewerLabel(modeler, pool.id, 'Bank');
    expect(modeler.modeling.updateLabel).toHaveBeenCalledWith(pool, 'Bank');
    expect(modeler.graphicsFactory.update).toHaveBeenCalledWith('shape', pool, { id: 'gfx' });
  });

  it('still paints a pool when updateLabel throws', () => {
    const pool: DiagramElement = {
      id: 'Participant_1',
      type: 'bpmn:Participant',
      businessObject: { $type: 'bpmn:Participant', name: 'Pool' },
    };
    const modeler = mockModeler(pool);
    modeler.modeling.updateLabel.mockImplementation(() => {
      throw new Error('cannot execute element.updateLabel');
    });
    applyViewerLabel(modeler, pool.id, 'Bank');
    expect(pool.businessObject?.name).toBe('Bank');
    expect(modeler.graphicsFactory.update).toHaveBeenCalledWith('shape', pool, { id: 'gfx' });
  });
});
