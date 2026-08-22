import { bpmnComponentRegistry, type BpmnComponentDefinition } from '@bpmn/semantic-core';
import type { DiagramElement } from '../diagramElement';
import { bpmnJsReplacePayload } from './replaceTargets';
import { flowKind, type FlowKind } from './inspectorModel';

type Getter = { get: (name: string, strict?: boolean) => unknown };

type ElementRegistry = {
  get: (id: string) => DiagramElement | undefined;
  getGraphics?: (el: unknown) => unknown;
};

type GraphicsFactory = { update: (type: 'shape' | 'connection', element: unknown, gfx: unknown) => void };

type Rules = { allowed: (action: string, context: unknown) => unknown };

type Modeling = {
  updateLabel: (element: unknown, name: string) => void;
  updateProperties: (element: unknown, properties: Record<string, unknown>) => void;
  removeElements: (elements: unknown[]) => void;
  createShape: (
    shape: unknown,
    position: { x: number; y: number },
    target: unknown,
    hints?: unknown,
  ) => unknown;
};

type BpmnReplace = { replaceElement: (element: unknown, target: unknown) => unknown };

type ElementFactory = { createShape: (attrs: Record<string, unknown>) => unknown };

type BpmnFactory = { create: (type: string, attrs?: Record<string, unknown>) => unknown };

type EditorActions = { trigger: (action: string) => unknown };

function live(modeler: Getter, id: string): DiagramElement | undefined {
  return (modeler.get('elementRegistry') as ElementRegistry).get(id);
}

function modeling(modeler: Getter): Modeling {
  return modeler.get('modeling') as Modeling;
}

export function canDeleteElement(modeler: Getter, element: DiagramElement): boolean {
  const allowed = (modeler.get('rules') as Rules).allowed('elements.delete', { elements: [element] });
  if (Array.isArray(allowed)) return allowed.includes(element) || allowed.length > 0;
  return !!allowed;
}

export function canReplaceWithBpmnJs(
  modeler: Getter,
  element: DiagramElement,
  def: BpmnComponentDefinition,
): boolean {
  if (def.bpmnType === 'bpmn:SequenceFlow') {
    return bpmnComponentRegistry.canCreate(def.id, {
      sourceBpmnType: element.source?.type,
      parentBpmnType: 'bpmn:Process',
    });
  }
  const allowed = (modeler.get('rules') as Rules).allowed('shape.replace', { element });
  if (!allowed) return false;
  return !!bpmnJsReplacePayload(def);
}

function gfxKind(element: DiagramElement): 'shape' | 'connection' {
  return element.type === 'bpmn:SequenceFlow' || element.type === 'bpmn:MessageFlow' ? 'connection' : 'shape';
}

function paintLabel(modeler: Getter, element: DiagramElement): void {
  const gfx = (modeler.get('elementRegistry') as ElementRegistry).getGraphics?.(element);
  if (!gfx) return;
  try {
    (modeler.get('graphicsFactory') as GraphicsFactory).update(gfxKind(element), element, gfx);
  } catch {
    /* root planes skip update; label text still sits on the businessObject */
  }
}

/** Semantic rename is already applied. Refresh bpmn-js paint without a second import. */
export function applyViewerLabel(modeler: Getter, elementId: string, name: string): void {
  const element = live(modeler, elementId);
  if (!element) return;
  const target = element.type === 'label' && element.labelTarget ? element.labelTarget : element;
  try {
    if (target.type === 'bpmn:TextAnnotation') {
      modeling(modeler).updateProperties(target, { text: name });
    } else {
      modeling(modeler).updateLabel(target, name);
    }
  } catch {
    if (target.businessObject) {
      if (target.type === 'bpmn:TextAnnotation') target.businessObject.text = name;
      else target.businessObject.name = name;
    }
  }
  paintLabel(modeler, target);
  const nested = (target as DiagramElement & { label?: DiagramElement }).label;
  if (nested) paintLabel(modeler, nested);
}

export function renameElement(modeler: Getter, elementId: string, name: string): void {
  applyViewerLabel(modeler, elementId, name);
}

export function replaceElement(modeler: Getter, elementId: string, def: BpmnComponentDefinition): void {
  const element = live(modeler, elementId);
  if (!element) return;
  if (def.bpmnType === 'bpmn:SequenceFlow') {
    const kind = def.id.replace('flow.', '') as FlowKind;
    if (kind === 'sequence' || kind === 'conditional' || kind === 'default') {
      applyFlowKind(modeler, elementId, kind);
    }
    return;
  }
  const payload = bpmnJsReplacePayload(def);
  if (!payload) return;
  (modeler.get('bpmnReplace') as BpmnReplace).replaceElement(element, payload);
}

export function deleteSelection(modeler: Getter): void {
  (modeler.get('editorActions') as EditorActions).trigger('removeSelection');
}

export function applyFlowKind(modeler: Getter, elementId: string, kind: FlowKind): void {
  const flow = live(modeler, elementId);
  if (!flow || flow.type !== 'bpmn:SequenceFlow') return;
  const source = flow.source;
  const factory = modeler.get('bpmnFactory') as BpmnFactory;
  const m = modeling(modeler);
  const current = flowKind(flow);

  if (kind === 'default') {
    if (source) m.updateProperties(source, { default: flow.businessObject });
    if (flow.businessObject?.conditionExpression) m.updateProperties(flow, { conditionExpression: undefined });
    return;
  }

  if (current === 'default' && source) m.updateProperties(source, { default: undefined });

  if (kind === 'conditional') {
    if (!flow.businessObject?.conditionExpression) {
      m.updateProperties(flow, { conditionExpression: factory.create('bpmn:FormalExpression', { body: '' }) });
    }
    return;
  }

  m.updateProperties(flow, { conditionExpression: undefined });
}

export function setCondition(modeler: Getter, flowId: string, body: string): void {
  const flow = live(modeler, flowId);
  if (!flow) return;
  const factory = modeler.get('bpmnFactory') as BpmnFactory;
  modeling(modeler).updateProperties(flow, {
    conditionExpression: factory.create('bpmn:FormalExpression', { body }),
  });
}

export function setDefaultOutgoing(modeler: Getter, sourceId: string, flowId: string): void {
  const source = live(modeler, sourceId);
  const flow = live(modeler, flowId);
  if (!source || !flow) return;
  modeling(modeler).updateProperties(source, { default: flow.businessObject });
}

export function attachBoundary(modeler: Getter, hostId: string, def: BpmnComponentDefinition): void {
  const host = live(modeler, hostId);
  if (!host) return;
  const factory = modeler.get('elementFactory') as ElementFactory;
  const nonInt = def.id.includes('nonInterrupting');
  const isTimer = def.id.includes('timer');
  const isError = def.id.includes('error');
  const shape = factory.createShape({
    type: def.bpmnType,
    eventDefinitionType: def.eventDefinition ? `bpmn:${def.eventDefinition}` : undefined,
    name: isTimer ? 'Timer boundary event' : isError ? 'Error boundary event' : 'Boundary event',
    cancelActivity: isError ? true : !nonInt,
  }) as DiagramElement & {
    businessObject?: DiagramElement['businessObject'] & {
      eventDefinitions?: Array<{ timeDuration?: string }>;
    };
  };
  if (isTimer && shape.businessObject?.eventDefinitions?.[0]) {
    shape.businessObject.eventDefinitions[0].timeDuration = 'PT1H';
  }
  const x = (host.x ?? 0) + (host.width ?? 100) / 2;
  const y = (host.y ?? 0) + (host.height ?? 80);
  modeling(modeler).createShape(shape, { x, y }, host, { attach: true });
}
