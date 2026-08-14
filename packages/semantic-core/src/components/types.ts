export const CATEGORIES = [
  'events',
  'activities',
  'gateways',
  'flows',
  'participants',
  'data',
  'artifacts',
] as const;

export type BpmnComponentCategory = (typeof CATEGORIES)[number];

export type EventDefinitionName =
  | 'MessageEventDefinition'
  | 'TimerEventDefinition'
  | 'ConditionalEventDefinition'
  | 'SignalEventDefinition'
  | 'ErrorEventDefinition'
  | 'EscalationEventDefinition'
  | 'CompensateEventDefinition'
  | 'CancelEventDefinition'
  | 'TerminateEventDefinition'
  | 'LinkEventDefinition';

export type EngineSupportLevel = 'supported' | 'unsupported' | 'partial';

export type EngineSupport = {
  camunda8: EngineSupportLevel;
  zeebe: EngineSupportLevel;
  camunda7: EngineSupportLevel;
  neutral: boolean;
};

export type LayoutPlacement =
  | 'flowNode'
  | 'attachToActivityBoundary'
  | 'sequenceFlow'
  | 'messageFlow'
  | 'association'
  | 'container'
  | 'pool'
  | 'lane'
  | 'data'
  | 'artifact';

export type LayoutBehavior = {
  placement: LayoutPlacement;
  exceptionBranch?: boolean;
};

export type AgentHints = {
  useFor: readonly string[];
  doNotUseFor: readonly string[];
};

/** Placement / connection context for catalog filtering. */
export type ComponentContext = {
  parentBpmnType?: string;
  inTransaction?: boolean;
  inEventSubProcess?: boolean;
  inAdHocSubProcess?: boolean;
  sourceBpmnType?: string;
  targetBpmnType?: string;
  attachToBpmnType?: string;
  attachToIsTransaction?: boolean;
};

export type ReplaceTarget = {
  bpmnType: string;
  eventDefinition?: string;
  componentId?: string;
  inTransaction?: boolean;
  inEventSubProcess?: boolean;
  triggeredByEvent?: boolean;
};

export type BpmnComponentDefinition = {
  id: string;
  bpmnType: string;
  eventDefinition?: EventDefinitionName;
  category: BpmnComponentCategory;
  title: string;
  icon: string;
  allowedParents: readonly string[];
  allowedSources: readonly string[];
  allowedTargets: readonly string[];
  canCreate: (context: ComponentContext) => boolean;
  canAttach: (context: ComponentContext) => boolean;
  canReplace: (element: ReplaceTarget) => boolean;
  semanticMeaning: string;
  agentHints: AgentHints;
  layoutBehavior: LayoutBehavior;
  engineSupport: EngineSupport;
  implemented: boolean;
};
