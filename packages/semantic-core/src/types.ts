export const FLOW_NODE_TYPES = [
  'start',
  'end',
  'task',
  'subProcess',
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway',
  'eventBasedGateway',
  'intermediateCatch',
  'boundaryEvent',
] as const;

export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];

export type GatewayKind = 'exclusive' | 'parallel' | 'inclusive' | 'eventBased';

export type RegionKind = GatewayKind | 'subprocess' | 'eventSubprocess';

export const DEFAULT_BPMN_TYPE: Record<FlowNodeType, string> = {
  start: 'bpmn:StartEvent',
  end: 'bpmn:EndEvent',
  task: 'bpmn:Task',
  subProcess: 'bpmn:SubProcess',
  exclusiveGateway: 'bpmn:ExclusiveGateway',
  parallelGateway: 'bpmn:ParallelGateway',
  inclusiveGateway: 'bpmn:InclusiveGateway',
  eventBasedGateway: 'bpmn:EventBasedGateway',
  intermediateCatch: 'bpmn:IntermediateCatchEvent',
  boundaryEvent: 'bpmn:BoundaryEvent',
};

/** JSON-safe BPMN extension tree. No $parent, no DI. */
export type ExtensionValue = {
  $type: string;
  $ns?: { prefix?: string; uri?: string };
  $body?: string;
  $children?: ExtensionValue[];
  [key: string]: unknown;
};

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  name: string;
  /** BPMN 2.0 element, e.g. `bpmn:UserTask`. Layout uses `type`; XML uses this. */
  bpmnType?: string;
  /** Host activity id when `type` is `boundaryEvent`. */
  attachedTo?: string;
  /** e.g. `TimerEventDefinition`. */
  eventDefinition?: string;
  /** Interrupting boundary (`cancelActivity`). Default true in BPMN. */
  cancelActivity?: boolean;
  /** Event subprocess (`triggeredByEvent`). Not on sequence flow. */
  triggeredByEvent?: boolean;
  extensionElements?: ExtensionValue[];
};

export type SequenceFlow = {
  id: string;
  source: string;
  target: string;
  name?: string;
  condition?: string;
  isDefault?: boolean;
  /** Outgoing of a boundary event — not happy-path sequence. */
  exception?: boolean;
  extensionElements?: ExtensionValue[];
};

/** Pool. `processId` omitted = black-box partner. Sequence flow never leaves that process. */
export type Participant = {
  id: string;
  name: string;
  processId?: string;
  extensionElements?: ExtensionValue[];
};

/** Responsibility band inside a pool / process. Does not change token semantics. */
export type Lane = {
  id: string;
  name: string;
  processId: string;
  participantId?: string;
  parentLaneId?: string;
  nodeIds: string[];
  extensionElements?: ExtensionValue[];
};

/** Interaction between participants. Never a sequence flow. */
export type MessageFlow = {
  id: string;
  name?: string;
  source: string;
  target: string;
  extensionElements?: ExtensionValue[];
};

/** Another process in a collaboration. Sequence flow stays inside this graph. */
export type ProcessGraph = {
  id: string;
  name: string;
  rootScopeId: string;
  scopes: Scope[];
  nodes: FlowNode[];
  flows: SequenceFlow[];
  regions: StructuredRegion[];
  unstructured: UnstructuredMark[];
  feedback: FeedbackEdge[];
  exceptionBranches: ExceptionBranch[];
  extensionElements?: ExtensionValue[];
};

export type Branch = {
  id: string;
  name: string;
  entryFlowId: string;
  nodeIds: string[];
  /** When true, agent tools must not mutate this branch. Human edits still apply. */
  locked?: boolean;
};

export type StructuredRegion = {
  id: string;
  type: RegionKind;
  split: string;
  join: string;
  branches: Branch[];
  nested: StructuredRegion[];
};

/** Boundary exception path (not a gateway region). */
export type ExceptionBranch = {
  id: string;
  hostId: string;
  boundaryId: string;
  entryFlowId: string;
  nodeIds: string[];
};

export const UNSTRUCTURED = 'UNSTRUCTURED' as const;
export const FEEDBACK = 'FEEDBACK' as const;

export type UnstructuredMark = {
  kind: typeof UNSTRUCTURED;
  gatewayId: string;
  reason: string;
};

/** Loop / back edge, or a boundary exception path. Routed off the happy-path corridor. */
export type FeedbackEdge = {
  kind: typeof FEEDBACK;
  id: string;
  flowId: string;
  source: string;
  target: string;
  reason: 'loop' | 'exception';
  attachedTo?: string;
  exceptionBranch?: boolean;
};

export type Scope = {
  id: string;
  parentId: string | null;
  /** Subprocess node that owns this scope. Null for the process root. */
  ownerId: string | null;
  nodeIds: string[];
  flowIds: string[];
};

/** Semantic process graph. No DI / coordinates. */
export type Process = {
  id: string;
  name: string;
  rootScopeId: string;
  scopes: Scope[];
  nodes: FlowNode[];
  flows: SequenceFlow[];
  regions: StructuredRegion[];
  unstructured: UnstructuredMark[];
  feedback: FeedbackEdge[];
  exceptionBranches: ExceptionBranch[];
  idSeq: Record<string, number>;
  extensionElements?: ExtensionValue[];
  collaborationId?: string;
  participants: Participant[];
  lanes: Lane[];
  messageFlows: MessageFlow[];
  /** Peer processes owned by other pools. The root graph is this object. */
  processes: ProcessGraph[];
};

export type SemanticProcess = Process;

export type Applied = {
  process: Process;
  inverse: (current: Process) => Process;
  id: string;
};

export type PlaceSpec = {
  name?: string;
  id?: string;
  after?: string;
  before?: string;
  branchId?: string;
  type?: FlowNodeType;
  bpmnType?: string;
  componentId?: string;
  from?: string;
  to?: string;
  participantId?: string;
};
