import { BPMN, TASK_TYPES } from './components/define.js';
import { bpmnComponentRegistry } from './components/index.js';
import { addLane, addMessageInteraction, addPool } from './collaboration.js';
import { defaultInsertAfter, getNode, isActivity } from './graph.js';
import {
  addAfter,
  addTask,
  attachBoundaryTimer,
  splitEventBased,
  splitExclusive,
  splitInclusive,
  splitParallel,
} from './ops.js';
import { addSubProcess, createEventSubprocess } from './subprocess.js';
import type { Applied, Process } from './types.js';

const TASK_SET = new Set<string>(TASK_TYPES);

/**
 * Insert a registry component after `afterId` (or on the happy path).
 * First slice: tasks, gateways, boundary timer, pool / lane / message flow.
 * Throws if the id has no kernel op.
 */
export function createFromComponent(
  process: Process,
  componentId: string,
  spec: { after?: string; name?: string; from?: string; to?: string; participantId?: string } = {},
): Applied {
  const def = bpmnComponentRegistry.get(componentId);
  if (!def) throw new Error(`unknown component: ${componentId}`);

  const after = spec.after;
  const name = spec.name ?? def.title;

  if (TASK_SET.has(def.bpmnType) || def.bpmnType === BPMN.callActivity) {
    const place = { name, bpmnType: def.bpmnType, type: 'task' as const };
    return after ? addAfter(process, after, place) : addTask(process, place);
  }

  if (componentId === 'start.none') throw new Error('A process already has a start event');
  if (componentId === 'end.none') throw new Error('End cannot be inserted on a sequence that already continues');
  if (componentId === 'flow.sequence') throw new Error('no semantic create op for flow.sequence');

  if (componentId === 'participant.pool') return addPool(process, { name });
  if (componentId === 'participant.lane') {
    if (after && (process.lanes ?? []).some((l) => l.id === after)) {
      return addLane(process, { parentLaneId: after, name });
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

  if (componentId === 'boundary.timer') {
    const hostId = after ?? defaultInsertAfter(process);
    if (!isActivity(getNode(process, hostId))) {
      throw new Error('Select an activity to attach a boundary timer');
    }
    return attachBoundaryTimer(process, { on: hostId, name });
  }

  const splitAfter = after ?? defaultInsertAfter(process);
  if (componentId === 'gateway.exclusive') return splitExclusive(process, { after: splitAfter, name });
  if (componentId === 'gateway.parallel') return splitParallel(process, { after: splitAfter, name });
  if (componentId === 'gateway.inclusive') return splitInclusive(process, { after: splitAfter, name });
  if (componentId === 'gateway.eventBased') return splitEventBased(process, { after: splitAfter, name });

  if (componentId === 'activity.subProcess') {
    return addSubProcess(process, { after: splitAfter, name });
  }
  if (componentId === 'activity.eventSubProcess') {
    const parent =
      after && process.nodes.some((n) => n.id === after && n.type === 'subProcess') ? after : process.id;
    return createEventSubprocess(process, { parent, name });
  }

  throw new Error(`no semantic create op for ${componentId}`);
}
