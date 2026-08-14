import type { BpmnComponentDefinition, BpmnComponentRegistry, ReplaceTarget } from '@bpmn/semantic-core';
import type { DiagramElement } from '../diagramElement';

export const NOT_IN_PROFILE = 'Not in modeling profile yet';
const ATTACH_IDS = ['boundary.timer', 'boundary.error'] as const;

export type ReplaceOptionView = {
  def: BpmnComponentDefinition;
  enabled: boolean;
  reason?: string;
};

export type FlowKind = 'sequence' | 'conditional' | 'default';

export type ReplaceTargetShape = {
  type: string;
  eventDefinitionType?: string;
  cancelActivity?: boolean;
  isInterrupting?: boolean;
  triggeredByEvent?: boolean;
  isExpanded?: boolean;
};

function eventDefinitionName(element: DiagramElement): string | undefined {
  const type = element.businessObject?.eventDefinitions?.[0]?.$type;
  return type?.replace(/^bpmn:/, '') || undefined;
}

export function isXorOr(type: string | undefined): boolean {
  return type === 'bpmn:ExclusiveGateway' || type === 'bpmn:InclusiveGateway';
}

export function elementName(element: DiagramElement): string {
  return element.businessObject?.name ?? element.businessObject?.text ?? '';
}

export function toReplaceTarget(element: DiagramElement): ReplaceTarget {
  let inTransaction = false;
  let inEventSubProcess = false;
  let node: DiagramElement | undefined = element.parent;
  while (node) {
    if (node.type === 'bpmn:Transaction') inTransaction = true;
    if (node.type === 'bpmn:SubProcess' && node.businessObject?.triggeredByEvent) inEventSubProcess = true;
    node = node.parent;
  }
  return {
    bpmnType: element.type,
    eventDefinition: eventDefinitionName(element),
    inTransaction,
    inEventSubProcess,
    triggeredByEvent: !!element.businessObject?.triggeredByEvent,
  };
}

function isNonInterrupting(element: DiagramElement): boolean {
  if (element.type === 'bpmn:BoundaryEvent') return element.businessObject?.cancelActivity === false;
  if (element.type === 'bpmn:StartEvent') return element.businessObject?.isInterrupting === false;
  return false;
}

export function isDefaultOutgoing(source: DiagramElement | undefined, flow: DiagramElement): boolean {
  const value = source?.businessObject?.default;
  if (!value) return false;
  if (typeof value === 'string') return value === flow.id;
  return value.id === flow.id;
}

export function flowKind(element: DiagramElement): FlowKind {
  if (isDefaultOutgoing(element.source, element)) return 'default';
  if (element.businessObject?.conditionExpression) return 'conditional';
  return 'sequence';
}

function isCurrentDef(def: BpmnComponentDefinition, element: DiagramElement): boolean {
  if (def.bpmnType !== element.type) return false;
  if (def.bpmnType === 'bpmn:SequenceFlow') return def.id === `flow.${flowKind(element)}`;
  if ((def.eventDefinition ?? undefined) !== eventDefinitionName(element)) return false;
  if (def.id === 'activity.eventSubProcess') return !!element.businessObject?.triggeredByEvent;
  if (def.id === 'activity.subProcess') return !element.businessObject?.triggeredByEvent;
  if (element.type === 'bpmn:BoundaryEvent' || element.type === 'bpmn:StartEvent') {
    return def.id.includes('nonInterrupting') === isNonInterrupting(element);
  }
  return true;
}

export function currentComponentId(registry: BpmnComponentRegistry, element: DiagramElement): string | undefined {
  return registry.list().find((def) => isCurrentDef(def, element))?.id;
}

export function matchesReplaceTarget(def: BpmnComponentDefinition, target: ReplaceTargetShape): boolean {
  if (target.type !== def.bpmnType) return false;
  const eventType = def.eventDefinition ? `bpmn:${def.eventDefinition}` : undefined;
  if ((target.eventDefinitionType ?? undefined) !== eventType) return false;

  if (def.id === 'activity.eventSubProcess') return target.triggeredByEvent === true;
  if (def.id === 'activity.subProcess') return !target.triggeredByEvent && target.isExpanded !== false;
  if (def.id === 'activity.adHocSubProcess') return true;

  const nonInt = def.id.includes('nonInterrupting');
  if (def.bpmnType === 'bpmn:BoundaryEvent') {
    return nonInt ? target.cancelActivity === false : target.cancelActivity !== false;
  }
  if (nonInt) return target.isInterrupting === false;
  if (target.isInterrupting === false) return false;
  return true;
}

export function findMatchingReplaceTarget<T extends ReplaceTargetShape>(
  def: BpmnComponentDefinition,
  targets: readonly T[],
): T | undefined {
  const matches = targets.filter((target) => matchesReplaceTarget(def, target));
  if (def.id === 'activity.subProcess') {
    return matches.find((target) => target.isExpanded === true) ?? matches[0];
  }
  return matches[0];
}

export function changeToOptions(
  registry: BpmnComponentRegistry,
  element: DiagramElement,
  query: string,
  replaceWorks: (def: BpmnComponentDefinition) => boolean,
): ReplaceOptionView[] {
  const target = toReplaceTarget(element);
  const currentId = currentComponentId(registry, element);
  const pool = query.trim() ? registry.search(query) : registry.replacementsFor(target);
  const seen = new Set<string>();
  const options: ReplaceOptionView[] = [];
  for (const def of pool) {
    if (seen.has(def.id) || def.id === currentId || def.category === 'flows') continue;
    seen.add(def.id);
    if (!registry.canReplace(def.id, target)) continue;
    const enabled = replaceWorks(def);
    options.push({ def, enabled, reason: enabled ? undefined : NOT_IN_PROFILE });
  }
  return options;
}

export function attachActions(
  registry: BpmnComponentRegistry,
  element: DiagramElement,
): Array<{ def: BpmnComponentDefinition; enabled: boolean; reason?: string }> {
  return ATTACH_IDS.flatMap((id) => {
    const def = registry.get(id);
    if (!def) return [];
    const ctx = { attachToBpmnType: element.type, parentBpmnType: element.parent?.type ?? 'bpmn:Process' };
    const enabled = def.canAttach(ctx) && registry.canCreate(id, ctx);
    return [{ def, enabled, reason: enabled ? undefined : 'Select an activity to attach' }];
  });
}

export type PoolLaneRow = { id: string; name: string };

export function isParticipant(element: DiagramElement): boolean {
  return element.type === 'bpmn:Participant';
}

export function isLaneElement(element: DiagramElement): boolean {
  return element.type === 'bpmn:Lane';
}

const LANE_COMPONENT_ID = 'participant.lane';

/** Registry create for a lane inside the selected pool — never a second type list. */
export function poolLaneCreate(
  registry: BpmnComponentRegistry,
  element: DiagramElement,
): { def: BpmnComponentDefinition; enabled: boolean; reason?: string } | undefined {
  if (!isParticipant(element)) return undefined;
  const def = registry.get(LANE_COMPONENT_ID);
  if (!def) return undefined;
  const ctx = { parentBpmnType: 'bpmn:Participant' };
  const enabled = registry.canCreate(LANE_COMPONENT_ID, ctx);
  return { def, enabled, reason: enabled ? undefined : NOT_IN_PROFILE };
}

export function lanesInPool(
  lanes: ReadonlyArray<{ id: string; name?: string; participantId?: string; parentLaneId?: string }>,
  participantId: string,
): PoolLaneRow[] {
  return lanes
    .filter((lane) => lane.participantId === participantId && !lane.parentLaneId)
    .map((lane) => ({ id: lane.id, name: lane.name ?? '' }));
}

export function outgoingSequenceFlows(element: DiagramElement): DiagramElement[] {
  return (element.outgoing ?? []).filter((flow) => flow.type === 'bpmn:SequenceFlow');
}
