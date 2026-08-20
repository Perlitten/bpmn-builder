import { rebuildStructure } from './detect.js';
import type { Applied, BpmnPreserve, FlowNode, Process, ProcessGraph, SequenceFlow } from './types.js';

function apply(prev: Process, fn: (draft: Process) => string): Applied {
  const draft = structuredClone(prev);
  const id = fn(draft);
  rebuildStructure(draft);
  return { process: draft, inverse: () => structuredClone(prev), id };
}

type PreserveOwner = {
  id: string;
  bpmnPreserve?: BpmnPreserve;
};

type ProcessHost = ProcessGraph | Process;
const UNSAFE_KEYS = new Set(['__proto__']);

function setRecordValue<T extends object>(record: T, key: string, value: unknown): void {
  if (UNSAFE_KEYS.has(key)) return;
  Object.defineProperty(record, key, { configurable: true, enumerable: true, writable: true, value });
}

function peers(draft: Process): ProcessHost[] {
  return [draft, ...(draft.processes ?? [])];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function compactPreserve(attrs?: Record<string, unknown>, props?: Record<string, unknown>): BpmnPreserve | undefined {
  const next: BpmnPreserve = {};
  if (attrs && Object.keys(attrs).length) next.attrs = attrs;
  if (props && Object.keys(props).length) next.props = props;
  return next.attrs || next.props ? next : undefined;
}

function assignPreserve(owner: PreserveOwner, next: BpmnPreserve | undefined): void {
  if (next) owner.bpmnPreserve = next;
  else delete owner.bpmnPreserve;
}

function patchProps(owner: PreserveOwner, patch: (props: Record<string, unknown>) => void): void {
  const props = { ...owner.bpmnPreserve?.props };
  patch(props);
  assignPreserve(owner, compactPreserve(owner.bpmnPreserve?.attrs, props));
}

function locateNode(draft: Process, id: string): FlowNode {
  for (const host of peers(draft)) {
    const node = host.nodes.find((item) => item.id === id);
    if (node) return node;
  }
  throw new Error(`unknown node: ${id}`);
}

function locateFlow(draft: Process, id: string): SequenceFlow | undefined {
  for (const host of peers(draft)) {
    const flow = host.flows.find((item) => item.id === id);
    if (flow) return flow;
  }
  return undefined;
}

function locateProcess(draft: Process, id: string): ProcessHost {
  const participant = draft.participants.find((item) => item.id === id);
  const processId = participant?.processId ?? id;
  const host = peers(draft).find((item) => item.id === processId);
  if (!host) throw new Error(`unknown process: ${id}`);
  return host;
}

function locatePreserveOwner(draft: Process, id: string): PreserveOwner {
  for (const host of peers(draft)) {
    if (host.id === id) return host;
    const node = host.nodes.find((item) => item.id === id);
    if (node) return node;
    const flow = host.flows.find((item) => item.id === id);
    if (flow) return flow;
  }
  const participant = draft.participants.find((item) => item.id === id);
  if (participant) return locateProcess(draft, id);
  throw new Error(`unknown element: ${id}`);
}

function documentationItems(owner: PreserveOwner): Record<string, unknown>[] {
  const docs = owner.bpmnPreserve?.props?.documentation;
  return Array.isArray(docs) ? docs.map((item) => ({ ...(asRecord(item) ?? { $type: 'bpmn:Documentation' }) })) : [];
}

/** BPMN `documentation` on a node, flow, process, or pool. */
export function setDocumentation(process: Process, id: string, text: string): Applied {
  return apply(process, (draft) => {
    const owner = locatePreserveOwner(draft, id);
    const body = text;
    patchProps(owner, (props) => {
      const rest = documentationItems(owner).slice(1);
      if (!body && rest.length === 0) delete props.documentation;
      else props.documentation = [{ $type: 'bpmn:Documentation', $body: body }, ...rest];
    });
    return owner.id;
  });
}

export function setIsExecutable(process: Process, executable: boolean, id?: string): Applied {
  return apply(process, (draft) => {
    const host = id ? locateProcess(draft, id) : draft;
    host.isExecutable = executable;
    return host.id;
  });
}

function isTimerType(value: unknown): boolean {
  return String(asRecord(value)?.$type ?? '').includes('TimerEventDefinition');
}

function eventDefinitionsOf(node: FlowNode): Record<string, unknown>[] {
  const defs = node.bpmnPreserve?.props?.eventDefinitions;
  return Array.isArray(defs) ? defs.map((item) => ({ ...(asRecord(item) ?? {}) })) : [];
}

function hasTimer(node: FlowNode): boolean {
  if (node.eventDefinition === 'TimerEventDefinition') return true;
  return eventDefinitionsOf(node).some(isTimerType);
}

/** ISO-8601 `timeDuration` on a timer event definition. */
export function setTimerDuration(process: Process, id: string, duration: string): Applied {
  return apply(process, (draft) => {
    const node = locateNode(draft, id);
    if (!hasTimer(node)) throw new Error(`cannot set timer duration on ${node.bpmnType ?? node.type}`);
    const body = duration.trim();
    patchProps(node, (props) => {
      const defs = eventDefinitionsOf(node);
      const next = defs.length ? defs : [{ $type: 'bpmn:TimerEventDefinition' }];
      let found = false;
      for (const def of next) {
        if (!isTimerType(def) && defs.length) continue;
        if (!isTimerType(def)) def.$type = 'bpmn:TimerEventDefinition';
        found = true;
        if (!body) delete def.timeDuration;
        else def.timeDuration = { $type: 'bpmn:Expression', $body: body };
      }
      if (!found) {
        next.push({
          $type: 'bpmn:TimerEventDefinition',
          ...(body ? { timeDuration: { $type: 'bpmn:Expression', $body: body } } : {}),
        });
      }
      props.eventDefinitions = next;
    });
    return id;
  });
}

/** Camunda / BPMN attributes stored on `bpmnPreserve.attrs` (topic, assignee, script, …). */
export function setPreserveAttr(process: Process, id: string, key: string, value: string): Applied {
  return apply(process, (draft) => {
    const owner = locatePreserveOwner(draft, id);
    const attrs = { ...owner.bpmnPreserve?.attrs };
    if (UNSAFE_KEYS.has(key)) return owner.id;
    if (!value) delete attrs[key];
    else setRecordValue(attrs, key, value);
    assignPreserve(owner, compactPreserve(attrs, owner.bpmnPreserve?.props));
    return owner.id;
  });
}

export type MultiInstanceSpec = {
  sequential?: boolean;
  cardinality?: string;
};

function loopRecord(node: FlowNode): Record<string, unknown> {
  return { ...(asRecord(node.bpmnPreserve?.props?.loopCharacteristics) ?? { $type: 'bpmn:MultiInstanceLoopCharacteristics' }) };
}

function loopIsEmpty(loop: Record<string, unknown>): boolean {
  const keys = Object.keys(loop).filter((key) => key !== '$type' && !(key === 'isSequential' && loop[key] !== true));
  return keys.length === 0 && loop.isSequential !== true;
}

/** Multi-instance `isSequential` / `loopCardinality` on an activity. */
export function setMultiInstance(process: Process, id: string, spec: MultiInstanceSpec): Applied {
  return apply(process, (draft) => {
    const node = locateNode(draft, id);
    if (node.type !== 'task' && !(node.type === 'subProcess' && !node.triggeredByEvent)) {
      throw new Error(`cannot set multi-instance on ${node.type}`);
    }
    patchProps(node, (props) => {
      const loop = loopRecord(node);
      if (!loop.$type) loop.$type = 'bpmn:MultiInstanceLoopCharacteristics';
      if (spec.sequential !== undefined) {
        if (spec.sequential) loop.isSequential = true;
        else delete loop.isSequential;
      }
      if (spec.cardinality !== undefined) {
        const body = spec.cardinality.trim();
        if (!body) delete loop.loopCardinality;
        else loop.loopCardinality = { $type: 'bpmn:Expression', $body: body };
      }
      if (loopIsEmpty(loop)) delete props.loopCharacteristics;
      else props.loopCharacteristics = loop;
    });
    return id;
  });
}

export function readDocumentation(owner: PreserveOwner | undefined): string {
  if (!owner) return '';
  const first = documentationItems(owner)[0];
  return typeof first?.$body === 'string' ? first.$body : '';
}

export function readTimerDuration(node: FlowNode | undefined): string {
  if (!node) return '';
  for (const def of eventDefinitionsOf(node)) {
    if (!isTimerType(def)) continue;
    const duration = asRecord(def.timeDuration);
    if (typeof duration?.$body === 'string') return duration.$body;
  }
  return '';
}

export function readPreserveAttr(owner: PreserveOwner | undefined, key: string): string {
  const value = owner?.bpmnPreserve?.attrs?.[key];
  return typeof value === 'string' ? value : '';
}

export function readMultiInstance(node: FlowNode | undefined): { sequential: boolean; cardinality: string } {
  const loop = asRecord(node?.bpmnPreserve?.props?.loopCharacteristics);
  const cardinality = asRecord(loop?.loopCardinality);
  return {
    sequential: loop?.isSequential === true,
    cardinality: typeof cardinality?.$body === 'string' ? cardinality.$body : '',
  };
}

export function owningProcessHost(process: Process, elementId: string): ProcessHost {
  for (const host of peers(process)) {
    if (host.id === elementId) return host;
    if (host.nodes.some((node) => node.id === elementId) || host.flows.some((flow) => flow.id === elementId)) return host;
  }
  try {
    return locateProcess(process, elementId);
  } catch {
    const lane = process.lanes.find((item) => item.id === elementId);
    if (lane) return peers(process).find((host) => host.id === lane.processId) ?? process;
    return process;
  }
}

export function findFlowNode(process: Process, id: string): FlowNode | undefined {
  try {
    return locateNode(process, id);
  } catch {
    return undefined;
  }
}

export function findSequenceFlow(process: Process, id: string): SequenceFlow | undefined {
  return locateFlow(process, id);
}
