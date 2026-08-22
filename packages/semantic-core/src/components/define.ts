import type {
  BpmnComponentCategory,
  BpmnComponentDefinition,
  ComponentContext,
  EngineSupport,
  EventDefinitionName,
  LayoutBehavior,
  ReplaceTarget,
} from './types.js';

/** Kernel-creatable ids (`createFromComponent`). Discoverable catalog is larger. */
export const IMPLEMENTED_COMPONENT_IDS = [
  'start.none',
  'end.none',
  'activity.task',
  'activity.userTask',
  'activity.serviceTask',
  'activity.sendTask',
  'activity.receiveTask',
  'activity.manualTask',
  'activity.businessRuleTask',
  'activity.scriptTask',
  'activity.callActivity',
  'activity.subProcess',
  'activity.eventSubProcess',
  'activity.transaction',
  'activity.adHocSubProcess',
  'gateway.exclusive',
  'gateway.parallel',
  'gateway.inclusive',
  'gateway.eventBased',
  'gateway.complex',
  'start.message',
  'start.timer',
  'start.conditional',
  'start.signal',
  'start.error',
  'start.escalation',
  'start.compensation',
  'start.message.nonInterrupting',
  'start.timer.nonInterrupting',
  'start.conditional.nonInterrupting',
  'start.signal.nonInterrupting',
  'start.escalation.nonInterrupting',
  'end.error',
  'end.message',
  'end.escalation',
  'end.signal',
  'end.compensation',
  'end.terminate',
  'end.cancel',
  'intermediate.catch.timer',
  'intermediate.catch.message',
  'intermediate.catch.conditional',
  'intermediate.catch.link',
  'intermediate.catch.signal',
  'intermediate.none',
  'intermediate.throw.message',
  'intermediate.throw.escalation',
  'intermediate.throw.link',
  'intermediate.throw.compensation',
  'intermediate.throw.signal',
  'boundary.message',
  'boundary.timer',
  'boundary.timer.nonInterrupting',
  'boundary.error',
  'boundary.escalation',
  'boundary.conditional',
  'boundary.signal',
  'boundary.compensation',
  'boundary.cancel',
  'boundary.message.nonInterrupting',
  'boundary.escalation.nonInterrupting',
  'boundary.conditional.nonInterrupting',
  'boundary.signal.nonInterrupting',
  'flow.sequence',
  'flow.conditional',
  'flow.default',
  'flow.association',
  'flow.dataAssociation',
  'flow.message',
  'participant.pool',
  'participant.lane',
  'data.object',
  'data.store',
  'artifact.group',
  'artifact.textAnnotation',
] as const;

export const ENGINES = {
  c8: { camunda8: 'supported', zeebe: 'supported', camunda7: 'supported', neutral: true },
  c7: { camunda8: 'unsupported', zeebe: 'unsupported', camunda7: 'supported', neutral: true },
  partial: { camunda8: 'partial', zeebe: 'partial', camunda7: 'supported', neutral: true },
} as const satisfies Record<string, EngineSupport>;

export const BPMN = {
  process: 'bpmn:Process',
  subProcess: 'bpmn:SubProcess',
  transaction: 'bpmn:Transaction',
  adHoc: 'bpmn:AdHocSubProcess',
  collaboration: 'bpmn:Collaboration',
  definitions: 'bpmn:Definitions',
  start: 'bpmn:StartEvent',
  end: 'bpmn:EndEvent',
  catch: 'bpmn:IntermediateCatchEvent',
  throw: 'bpmn:IntermediateThrowEvent',
  boundary: 'bpmn:BoundaryEvent',
  task: 'bpmn:Task',
  userTask: 'bpmn:UserTask',
  serviceTask: 'bpmn:ServiceTask',
  sendTask: 'bpmn:SendTask',
  receiveTask: 'bpmn:ReceiveTask',
  manualTask: 'bpmn:ManualTask',
  businessRuleTask: 'bpmn:BusinessRuleTask',
  scriptTask: 'bpmn:ScriptTask',
  callActivity: 'bpmn:CallActivity',
  exclusive: 'bpmn:ExclusiveGateway',
  parallel: 'bpmn:ParallelGateway',
  inclusive: 'bpmn:InclusiveGateway',
  complex: 'bpmn:ComplexGateway',
  eventBased: 'bpmn:EventBasedGateway',
  sequenceFlow: 'bpmn:SequenceFlow',
  messageFlow: 'bpmn:MessageFlow',
  association: 'bpmn:Association',
  dataAssociation: 'bpmn:DataAssociation',
  participant: 'bpmn:Participant',
  lane: 'bpmn:Lane',
  dataObject: 'bpmn:DataObjectReference',
  dataStore: 'bpmn:DataStoreReference',
  group: 'bpmn:Group',
  textAnnotation: 'bpmn:TextAnnotation',
} as const;

export const FLOW_PARENTS = [BPMN.process, BPMN.subProcess, BPMN.transaction, BPMN.adHoc] as const;

export const TASK_TYPES = [
  BPMN.task,
  BPMN.userTask,
  BPMN.serviceTask,
  BPMN.sendTask,
  BPMN.receiveTask,
  BPMN.manualTask,
  BPMN.businessRuleTask,
  BPMN.scriptTask,
] as const;

const ACTIVITY_TYPES = [
  ...TASK_TYPES,
  BPMN.subProcess,
  BPMN.callActivity,
  BPMN.transaction,
  BPMN.adHoc,
] as const;

export const GATEWAY_TYPES = [
  BPMN.exclusive,
  BPMN.parallel,
  BPMN.inclusive,
  BPMN.complex,
  BPMN.eventBased,
] as const;

export const SEQUENCE_FLOW_NODES = [
  BPMN.start,
  BPMN.end,
  BPMN.catch,
  BPMN.throw,
  BPMN.boundary,
  ...ACTIVITY_TYPES,
  ...GATEWAY_TYPES,
] as const;

const ACTIVITY_SET = new Set<string>(ACTIVITY_TYPES);
const FLOW_NODE_SET = new Set<string>(SEQUENCE_FLOW_NODES);
const CONDITIONAL_SOURCES = new Set<string>([...TASK_TYPES, BPMN.subProcess, BPMN.callActivity, BPMN.exclusive, BPMN.inclusive]);
const DEFAULT_SOURCES = new Set<string>([...TASK_TYPES, BPMN.subProcess, BPMN.callActivity, BPMN.exclusive, BPMN.inclusive]);
const MESSAGE_ENDPOINTS = new Set<string>([
  BPMN.participant,
  ...TASK_TYPES,
  BPMN.subProcess,
  BPMN.callActivity,
  BPMN.start,
  BPMN.end,
  BPMN.catch,
  BPMN.throw,
  BPMN.boundary,
]);

export function isActivityType(bpmnType: string | undefined): boolean {
  return !!bpmnType && ACTIVITY_SET.has(bpmnType);
}

export function isTransactionScope(ctx: ComponentContext): boolean {
  return ctx.inTransaction === true || ctx.parentBpmnType === BPMN.transaction;
}

export function isEventSubProcessScope(ctx: ComponentContext): boolean {
  return ctx.inEventSubProcess === true;
}

export function parentOk(allowed: readonly string[], ctx: ComponentContext): boolean {
  const parent = ctx.parentBpmnType ?? BPMN.process;
  if (allowed.includes(parent)) return true;
  return parent === BPMN.lane && allowed.includes(BPMN.process);
}

export function replaceContext(element: ReplaceTarget): ComponentContext {
  const eventSub = element.inEventSubProcess ?? element.triggeredByEvent;
  return {
    parentBpmnType: element.inTransaction ? BPMN.transaction : eventSub ? BPMN.subProcess : BPMN.process,
    inTransaction: element.inTransaction,
    inEventSubProcess: eventSub,
  };
}

function sourceOk(allowed: readonly string[], ctx: ComponentContext): boolean {
  return !ctx.sourceBpmnType || allowed.includes(ctx.sourceBpmnType);
}

function targetOk(allowed: readonly string[], ctx: ComponentContext): boolean {
  return !ctx.targetBpmnType || allowed.includes(ctx.targetBpmnType);
}

type Spec = {
  id: string;
  bpmnType: string;
  eventDefinition?: EventDefinitionName;
  category: BpmnComponentCategory;
  title: string;
  icon?: string;
  allowedParents: readonly string[];
  allowedSources?: readonly string[];
  allowedTargets?: readonly string[];
  canCreate?: (context: ComponentContext) => boolean;
  canAttach?: (context: ComponentContext) => boolean;
  canReplace?: (element: ReplaceTarget) => boolean;
  semanticMeaning: string;
  useFor: readonly string[];
  doNotUseFor: readonly string[];
  layoutBehavior: LayoutBehavior;
  engineSupport: EngineSupport;
};

export function component(spec: Spec): BpmnComponentDefinition {
  const allowedSources = spec.allowedSources ?? [];
  const allowedTargets = spec.allowedTargets ?? [];
  const canCreate =
    spec.canCreate ??
    ((ctx) => parentOk(spec.allowedParents, ctx) && sourceOk(allowedSources, ctx) && targetOk(allowedTargets, ctx));
  return {
    id: spec.id,
    bpmnType: spec.bpmnType,
    ...(spec.eventDefinition ? { eventDefinition: spec.eventDefinition } : {}),
    category: spec.category,
    title: spec.title,
    icon: spec.icon ?? spec.id,
    allowedParents: spec.allowedParents,
    allowedSources,
    allowedTargets,
    canCreate,
    canAttach: spec.canAttach ?? (() => false),
    canReplace: spec.canReplace ?? ((el) => el.bpmnType === spec.bpmnType && canCreate(replaceContext(el))),
    semanticMeaning: spec.semanticMeaning,
    agentHints: { useFor: spec.useFor, doNotUseFor: spec.doNotUseFor },
    layoutBehavior: spec.layoutBehavior,
    engineSupport: spec.engineSupport,
    implemented: (IMPLEMENTED_COMPONENT_IDS as readonly string[]).includes(spec.id),
  };
}

export function inFlowScope(ctx: ComponentContext): boolean {
  return parentOk(FLOW_PARENTS, ctx);
}

export { CONDITIONAL_SOURCES, DEFAULT_SOURCES, FLOW_NODE_SET, MESSAGE_ENDPOINTS };
