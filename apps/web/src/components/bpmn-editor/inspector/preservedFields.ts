import {
  findFlowNode,
  findSequenceFlow,
  owningProcessHost,
  readDocumentation,
  readMultiInstance,
  readPreserveAttr,
  readTimerDuration,
  type Process,
} from '@bpmn/semantic-core';
import type { DiagramElement } from '../diagramElement';

export type PreservedChange =
  | { op: 'documentation'; id: string; value: string }
  | { op: 'calledElement'; id: string; value: string }
  | { op: 'timerDuration'; id: string; value: string }
  | { op: 'isExecutable'; id: string; value: boolean }
  | { op: 'attr'; id: string; key: string; value: string }
  | { op: 'multiInstance'; id: string; sequential?: boolean; cardinality?: string };

export type PreservedField = {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'checkbox';
  value: string | boolean;
  group: 'documentation' | 'element' | 'execution' | 'multiInstance' | 'process';
  change: PreservedChange;
};

function bpmnTypeOf(process: Process, element: DiagramElement): string {
  return findFlowNode(process, element.id)?.bpmnType ?? element.type;
}

function isTimerElement(process: Process, element: DiagramElement): boolean {
  const node = findFlowNode(process, element.id);
  if (node?.eventDefinition === 'TimerEventDefinition') return true;
  const defs = node?.bpmnPreserve?.props?.eventDefinitions;
  if (Array.isArray(defs) && defs.some((def) => String((def as { $type?: string }).$type ?? '').includes('TimerEventDefinition'))) {
    return true;
  }
  return (element.businessObject?.eventDefinitions ?? []).some((def) => def.$type?.includes('TimerEventDefinition'));
}

function isActivityType(type: string): boolean {
  return (
    type === 'bpmn:Task' ||
    type === 'bpmn:UserTask' ||
    type === 'bpmn:ServiceTask' ||
    type === 'bpmn:SendTask' ||
    type === 'bpmn:ReceiveTask' ||
    type === 'bpmn:ScriptTask' ||
    type === 'bpmn:BusinessRuleTask' ||
    type === 'bpmn:ManualTask' ||
    type === 'bpmn:CallActivity' ||
    type === 'bpmn:SubProcess' ||
    type === 'bpmn:Transaction' ||
    type === 'bpmn:AdHocSubProcess'
  );
}

/**
 * Fields the serializer already round-trips. Still opaque: extensionElements,
 * camunda:type, messageRef/errorRef, timeDate/timeCycle, artifacts, definitions meta.
 */
export function preservedFieldsFor(process: Process, element: DiagramElement): PreservedField[] {
  const node = findFlowNode(process, element.id);
  const flow = findSequenceFlow(process, element.id);
  const type = bpmnTypeOf(process, element);
  const owner = owningProcessHost(process, element.id);
  const fields: PreservedField[] = [];

  if (node || flow) {
    const target = node ?? flow!;
    fields.push({
      key: 'documentation',
      label: 'Documentation',
      kind: 'textarea',
      value: readDocumentation(target),
      group: 'documentation',
      change: { op: 'documentation', id: element.id, value: readDocumentation(target) },
    });
  }

  if (isTimerElement(process, element) && node) {
    const value = readTimerDuration(node);
    fields.push({
      key: 'timerDuration',
      label: 'Timer duration',
      kind: 'text',
      value,
      group: 'element',
      change: { op: 'timerDuration', id: element.id, value },
    });
  }

  if (type === 'bpmn:ServiceTask' && node) {
    const value = readPreserveAttr(node, 'camunda:topic');
    fields.push({
      key: 'topic',
      label: 'Topic',
      kind: 'text',
      value,
      group: 'execution',
      change: { op: 'attr', id: element.id, key: 'camunda:topic', value },
    });
  }

  if (type === 'bpmn:UserTask' && node) {
    const value = readPreserveAttr(node, 'camunda:assignee');
    fields.push({
      key: 'assignee',
      label: 'Camunda assignee',
      kind: 'text',
      value,
      group: 'execution',
      change: { op: 'attr', id: element.id, key: 'camunda:assignee', value },
    });
  }

  if (type === 'bpmn:BusinessRuleTask' && node) {
    const value = readPreserveAttr(node, 'camunda:decisionRef');
    fields.push({
      key: 'decisionRef',
      label: 'Decision ref',
      kind: 'text',
      value,
      group: 'execution',
      change: { op: 'attr', id: element.id, key: 'camunda:decisionRef', value },
    });
  }

  if (type === 'bpmn:ScriptTask' && node) {
    const script = readPreserveAttr(node, 'script');
    const format = readPreserveAttr(node, 'scriptFormat');
    fields.push({
      key: 'script',
      label: 'Script',
      kind: 'textarea',
      value: script,
      group: 'execution',
      change: { op: 'attr', id: element.id, key: 'script', value: script },
    });
    fields.push({
      key: 'scriptFormat',
      label: 'Script format',
      kind: 'text',
      value: format,
      group: 'execution',
      change: { op: 'attr', id: element.id, key: 'scriptFormat', value: format },
    });
  }

  if (node && isActivityType(type) && type !== 'bpmn:AdHocSubProcess') {
    const mi = readMultiInstance(node);
    fields.push({
      key: 'multiInstanceSequential',
      label: 'Sequential multi-instance',
      kind: 'checkbox',
      value: mi.sequential,
      group: 'multiInstance',
      change: { op: 'multiInstance', id: element.id, sequential: mi.sequential },
    });
    fields.push({
      key: 'multiInstanceCardinality',
      label: 'Multi-instance cardinality',
      kind: 'text',
      value: mi.cardinality,
      group: 'multiInstance',
      change: { op: 'multiInstance', id: element.id, cardinality: mi.cardinality },
    });
  }

  const processDoc = readDocumentation(owner);
  fields.push({
    key: 'isExecutable',
    label: 'Executable',
    kind: 'checkbox',
    value: owner.isExecutable === true,
    group: 'process',
    change: { op: 'isExecutable', id: owner.id, value: owner.isExecutable === true },
  });
  fields.push({
    key: 'processDocumentation',
    label: 'Process documentation',
    kind: 'textarea',
    value: processDoc,
    group: 'process',
    change: { op: 'documentation', id: owner.id, value: processDoc },
  });

  return fields;
}

export function applyPreservedValue(field: PreservedField, value: string | boolean): PreservedChange {
  if (field.change.op === 'isExecutable') return { ...field.change, value: Boolean(value) };
  if (field.change.op === 'multiInstance') {
    if (field.key === 'multiInstanceSequential') return { ...field.change, sequential: Boolean(value) };
    return { ...field.change, cardinality: String(value) };
  }
  if (field.change.op === 'attr') return { ...field.change, value: String(value) };
  return { ...field.change, value: String(value) };
}

export function commitPreservedChange(
  session: {
    setDocumentation: (id: string, text: string) => Promise<string>;
    setCalledElement: (id: string, calledElement: string) => Promise<string>;
    setTimerDuration: (id: string, duration: string) => Promise<string>;
    setIsExecutable: (executable: boolean, id?: string) => Promise<string>;
    setPreserveAttr: (id: string, key: string, value: string) => Promise<string>;
    setMultiInstance: (id: string, spec: { sequential?: boolean; cardinality?: string }) => Promise<string>;
  },
  change: PreservedChange,
): Promise<string> {
  if (change.op === 'documentation') return session.setDocumentation(change.id, change.value);
  if (change.op === 'calledElement') return session.setCalledElement(change.id, change.value);
  if (change.op === 'timerDuration') return session.setTimerDuration(change.id, change.value);
  if (change.op === 'isExecutable') return session.setIsExecutable(change.value, change.id);
  if (change.op === 'attr') return session.setPreserveAttr(change.id, change.key, change.value);
  return session.setMultiInstance(change.id, { sequential: change.sequential, cardinality: change.cardinality });
}
