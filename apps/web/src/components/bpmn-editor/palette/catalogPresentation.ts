import {
  CATEGORIES,
  type BpmnComponentCategory,
  type BpmnComponentDefinition,
  type EventDefinitionName,
} from '@bpmn/semantic-core';

export type PaletteCategoryId = BpmnComponentCategory;
export type PaletteCatalogView = 'home' | PaletteCategoryId;

export const CATEGORY_LABEL: Record<BpmnComponentCategory, string> = {
  events: 'Events',
  activities: 'Activities',
  gateways: 'Gateways',
  flows: 'Flows',
  participants: 'Participants',
  data: 'Data',
  artifacts: 'Artifacts',
};

export const PALETTE_CATEGORIES = CATEGORIES.map((id) => ({ id, label: CATEGORY_LABEL[id] }));

export type CatalogCreateKind =
  | 'shape'
  | 'subprocess'
  | 'participant'
  | 'lane'
  | 'attach'
  | 'connect-sequence'
  | 'connect-message'
  | 'association';

export function createKind(def: BpmnComponentDefinition): CatalogCreateKind {
  switch (def.layoutBehavior.placement) {
    case 'attachToActivityBoundary':
      return 'attach';
    case 'sequenceFlow':
      return 'connect-sequence';
    case 'messageFlow':
      return 'connect-message';
    case 'association':
      return 'association';
    case 'pool':
      return 'participant';
    case 'lane':
      return 'lane';
    case 'container':
      return 'subprocess';
    default:
      return 'shape';
  }
}

export function catalogGroup(def: BpmnComponentDefinition): string {
  switch (def.category) {
    case 'events':
      if (def.id.startsWith('start.')) return 'Start';
      if (def.id.startsWith('intermediate.catch.')) return 'Intermediate catch';
      if (def.id.startsWith('boundary.')) return 'Boundary';
      if (def.id.startsWith('end.')) return 'End';
      return 'Intermediate throw';
    case 'activities':
      if (def.id === 'activity.callActivity') return 'Calls';
      if (def.layoutBehavior.placement === 'container') return 'Sub-processes';
      return 'Tasks';
    case 'gateways':
      return def.id === 'gateway.eventBased' ? 'Event-based' : 'Data-based';
    case 'flows':
      if (def.layoutBehavior.placement === 'messageFlow') return 'Collaboration';
      if (def.layoutBehavior.placement === 'association') return 'Artifacts';
      return 'Control';
    case 'participants':
      return 'Collaboration';
    case 'data':
      return 'Data';
    case 'artifacts':
      return 'Artifacts';
  }
}

const EVENT_GLYPH: Record<EventDefinitionName, string> = {
  MessageEventDefinition: 'message',
  TimerEventDefinition: 'timer',
  ConditionalEventDefinition: 'condition',
  SignalEventDefinition: 'signal',
  ErrorEventDefinition: 'error',
  EscalationEventDefinition: 'escalation',
  CompensateEventDefinition: 'compensation',
  CancelEventDefinition: 'cancel',
  TerminateEventDefinition: 'terminate',
  LinkEventDefinition: 'link',
};

const TYPE_ICON: Record<string, string> = {
  'bpmn:Task': 'bpmn-icon-task',
  'bpmn:UserTask': 'bpmn-icon-user',
  'bpmn:ServiceTask': 'bpmn-icon-service',
  'bpmn:SendTask': 'bpmn-icon-send',
  'bpmn:ReceiveTask': 'bpmn-icon-receive',
  'bpmn:ScriptTask': 'bpmn-icon-script',
  'bpmn:BusinessRuleTask': 'bpmn-icon-business-rule',
  'bpmn:ManualTask': 'bpmn-icon-manual',
  'bpmn:CallActivity': 'bpmn-icon-call-activity',
  'bpmn:SubProcess': 'bpmn-icon-subprocess-expanded',
  'bpmn:Transaction': 'bpmn-icon-transaction',
  'bpmn:AdHocSubProcess': 'bpmn-icon-subprocess-expanded',
  'bpmn:ExclusiveGateway': 'bpmn-icon-gateway-xor',
  'bpmn:InclusiveGateway': 'bpmn-icon-gateway-or',
  'bpmn:ParallelGateway': 'bpmn-icon-gateway-parallel',
  'bpmn:ComplexGateway': 'bpmn-icon-gateway-complex',
  'bpmn:EventBasedGateway': 'bpmn-icon-gateway-eventbased',
  'bpmn:Participant': 'bpmn-icon-participant',
  'bpmn:Lane': 'bpmn-icon-lane',
  'bpmn:DataObjectReference': 'bpmn-icon-data-object',
  'bpmn:DataStoreReference': 'bpmn-icon-data-store',
  'bpmn:Group': 'bpmn-icon-group',
  'bpmn:TextAnnotation': 'bpmn-icon-text-annotation',
  'bpmn:MessageFlow': 'bpmn-icon-connection-multi',
  'bpmn:Association': 'bpmn-icon-connection',
  'bpmn:DataAssociation': 'bpmn-icon-connection',
};

function eventIcon(prefix: string, def: BpmnComponentDefinition, catchLike: boolean): string {
  const glyph = def.eventDefinition ? EVENT_GLYPH[def.eventDefinition] : 'none';
  const nonInt = def.id.includes('nonInterrupting');
  if (prefix === 'start-event' && nonInt) return `bpmn-icon-start-event-non-interrupting-${glyph}`;
  if (catchLike && nonInt) return `bpmn-icon-intermediate-event-catch-non-interrupting-${glyph}`;
  if (prefix === 'intermediate-event-throw' && glyph === 'none') return 'bpmn-icon-intermediate-event-none';
  return `bpmn-icon-${prefix}-${glyph}`;
}

export function iconClassFor(def: BpmnComponentDefinition): string {
  switch (def.bpmnType) {
    case 'bpmn:StartEvent':
      return eventIcon('start-event', def, false);
    case 'bpmn:EndEvent':
      return eventIcon('end-event', def, false);
    case 'bpmn:IntermediateCatchEvent':
      return eventIcon('intermediate-event-catch', def, true);
    case 'bpmn:IntermediateThrowEvent':
      return eventIcon('intermediate-event-throw', def, false);
    case 'bpmn:BoundaryEvent':
      return eventIcon('intermediate-event-catch', def, true);
    case 'bpmn:SequenceFlow':
      if (def.id === 'flow.conditional') return 'bpmn-icon-conditional-flow';
      if (def.id === 'flow.default') return 'bpmn-icon-default-flow';
      return 'bpmn-icon-connection';
    default:
      if (def.id === 'activity.eventSubProcess') return 'bpmn-icon-event-subprocess-expanded';
      return TYPE_ICON[def.bpmnType] ?? '';
  }
}
