import { addAssociation, addDataObject, addDataStore, addGroup, addTextAnnotation, resolveAssociationEnds } from './artifacts.js';
import { BPMN, TASK_TYPES } from './components/define.js';
import { bpmnComponentRegistry } from './components/index.js';
import { addLane, addMessageInteraction, addPool } from './collaboration.js';
import { defaultInsertAfter, getNode, happyPathIds, isActivity, outgoingFlows } from './graph.js';
import {
  addAfter,
  addTask,
  attachBoundaryEvent,
  setEventDefinition,
  setFlowKind,
  splitComplex,
  splitEventBased,
  splitExclusive,
  splitInclusive,
  splitParallel,
} from './ops.js';
import { addSubProcess, createEventSubprocess } from './subprocess.js';
import type { Applied, Process } from './types.js';

const TASK_SET = new Set<string>(TASK_TYPES);

const CATCH_DEFS = new Set(['TimerEventDefinition', 'MessageEventDefinition', 'ConditionalEventDefinition']);
const START_DEFS = new Set(['MessageEventDefinition', 'TimerEventDefinition', 'ConditionalEventDefinition']);
const END_DEFS = new Set(['ErrorEventDefinition', 'TerminateEventDefinition']);
const BOUNDARY_DEFS = new Set(['TimerEventDefinition', 'ErrorEventDefinition']);

/**
 * Insert a registry component after `afterId` (or on the happy path).
 * Throws if the id has no kernel op.
 */
export function createFromComponent(
  process: Process,
  componentId: string,
  spec: {
    after?: string;
    name?: string;
    from?: string;
    to?: string;
    participantId?: string;
    calledElement?: string;
    condition?: string;
  } = {},
): Applied {
  const def = bpmnComponentRegistry.get(componentId);
  if (!def) throw new Error(`unknown component: ${componentId}`);

  const after = spec.after;
  const name = spec.name ?? def.title;

  if (TASK_SET.has(def.bpmnType) || def.bpmnType === BPMN.callActivity) {
    const place = {
      name,
      bpmnType: def.bpmnType,
      type: 'task' as const,
      ...(spec.calledElement && def.bpmnType === BPMN.callActivity ? { calledElement: spec.calledElement } : {}),
    };
    return after ? addAfter(process, after, place) : addTask(process, place);
  }

  if (componentId === 'start.none') throw new Error('A process already has a start event');
  if (componentId === 'end.none') throw new Error('End cannot be inserted on a sequence that already continues');
  if (componentId === 'flow.sequence') throw new Error('no semantic create op for flow.sequence');

  if (componentId === 'participant.pool') return addPool(process, { name });
  if (componentId === 'participant.lane') {
    if (after && (process.lanes ?? []).some((l) => l.id === after)) {
      const lane = process.lanes.find((item) => item.id === after)!;
      return addLane(process, {
        participantId: lane.participantId,
        parentLaneId: lane.parentLaneId,
        name,
      });
    }
    if (after && (process.participants ?? []).some((p) => p.id === after)) {
      return addLane(process, { participantId: after, name });
    }
    return addLane(process, { participantId: spec.participantId, name });
  }
  if (componentId === 'flow.message') {
    const parts = process.participants ?? [];
    if (parts.length < 2) throw new Error('Message flow needs two participants');
    const from =
      spec.from ?? (after && parts.some((p) => p.id === after) ? after : parts[0]!.id);
    const to = spec.to ?? parts.find((p) => p.id !== from)?.id;
    if (!to) throw new Error('Message flow needs two participants');
    return addMessageInteraction(process, { from, to, name });
  }

  if (def.bpmnType === BPMN.boundary && def.eventDefinition && BOUNDARY_DEFS.has(def.eventDefinition)) {
    const hostId = after ?? defaultInsertAfter(process);
    if (!isActivity(getNode(process, hostId))) {
      throw new Error('Select an activity to attach a boundary event');
    }
    return attachBoundaryEvent(process, {
      on: hostId,
      name,
      eventDefinition: def.eventDefinition,
      interrupting: !componentId.includes('nonInterrupting'),
    });
  }

  if (def.bpmnType === BPMN.catch && def.eventDefinition && CATCH_DEFS.has(def.eventDefinition)) {
    const splitAfter = after ?? defaultInsertAfter(process);
    return addAfter(process, splitAfter, {
      name,
      type: 'intermediateCatch',
      bpmnType: BPMN.catch,
      eventDefinition: def.eventDefinition,
    });
  }

  if (def.bpmnType === BPMN.start && def.eventDefinition && START_DEFS.has(def.eventDefinition) && !componentId.includes('nonInterrupting')) {
    return setEventDefinition(process, resolveStart(process, after), def.eventDefinition);
  }

  if (def.bpmnType === BPMN.end && def.eventDefinition && END_DEFS.has(def.eventDefinition)) {
    return setEventDefinition(process, resolveEnd(process, after), def.eventDefinition);
  }

  if (componentId === 'flow.conditional' || componentId === 'flow.default') {
    const flowId = resolveSequenceFlow(process, after, spec.from);
    return setFlowKind(
      process,
      flowId,
      componentId === 'flow.default' ? 'default' : 'conditional',
      spec.condition,
    );
  }

  if (componentId === 'flow.association') {
    return addAssociation(process, resolveAssociationEnds(process, { from: spec.from, to: spec.to, after }));
  }

  if (componentId === 'data.object') return addDataObject(process, { name });
  if (componentId === 'data.store') return addDataStore(process, { name });
  if (componentId === 'artifact.textAnnotation') {
    const associateTo = after && process.nodes.some((n) => n.id === after) ? after : undefined;
    return addTextAnnotation(process, { text: name === def.title ? '' : name, associateTo });
  }
  if (componentId === 'artifact.group') return addGroup(process, { name });

  const splitAfter = after ?? defaultInsertAfter(process);
  if (componentId === 'gateway.exclusive') return splitExclusive(process, { after: splitAfter, name });
  if (componentId === 'gateway.parallel') return splitParallel(process, { after: splitAfter, name });
  if (componentId === 'gateway.inclusive') return splitInclusive(process, { after: splitAfter, name });
  if (componentId === 'gateway.eventBased') return splitEventBased(process, { after: splitAfter, name });
  if (componentId === 'gateway.complex') return splitComplex(process, { after: splitAfter, name });

  if (componentId === 'activity.subProcess' || componentId === 'activity.transaction' || componentId === 'activity.adHocSubProcess') {
    return addSubProcess(process, { after: splitAfter, name, bpmnType: def.bpmnType });
  }
  if (componentId === 'activity.eventSubProcess') {
    const parent =
      after && process.nodes.some((n) => n.id === after && n.type === 'subProcess') ? after : process.id;
    return createEventSubprocess(process, { parent, name });
  }

  throw new Error(`no semantic create op for ${componentId}`);
}

function resolveStart(process: Process, after?: string): string {
  if (after) {
    const node = process.nodes.find((n) => n.id === after);
    if (node?.type === 'start') return node.id;
  }
  const starts = process.nodes.filter((n) => n.type === 'start');
  const none = starts.find((n) => !n.eventDefinition);
  const start = none ?? starts[0];
  if (!start) throw new Error('process has no start event');
  return start.id;
}

function resolveEnd(process: Process, after?: string): string {
  if (after) {
    const node = process.nodes.find((n) => n.id === after);
    if (node?.type === 'end') return node.id;
    const outs = outgoingFlows(process, after);
    if (outs.length === 1) {
      const target = process.nodes.find((n) => n.id === outs[0]!.target);
      if (target?.type === 'end') return target.id;
    }
  }
  try {
    const path = happyPathIds(process);
    const end = [...path].reverse().find((id) => getNode(process, id).type === 'end');
    if (end) return end;
  } catch {
    /* empty graph */
  }
  const end = process.nodes.find((n) => n.type === 'end');
  if (!end) throw new Error('process has no end event');
  return end.id;
}

function resolveSequenceFlow(process: Process, after?: string, from?: string): string {
  const hint = after ?? from;
  if (!hint) throw new Error('Select a sequence flow or a source with one outgoing flow');
  if (process.flows.some((f) => f.id === hint)) return hint;
  const outs = outgoingFlows(process, hint);
  if (outs.length === 1) return outs[0]!.id;
  if (!outs.length) throw new Error('Select a sequence flow or a source with one outgoing flow');
  throw new Error('This gateway has several outgoing flows. Pick a branch flow.');
}
