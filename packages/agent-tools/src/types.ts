import type { Applied, ExceptionBranch, FeedbackEdge, FlowNodeType, Process, RegionKind, UnstructuredMark } from '../../semantic-core/src/index.js';

export const TOOL_NAMES = [
  'inspectProcess',
  'inspectRegion',
  'inspectBranch',
  'addTask',
  'addAfter',
  'addBefore',
  'splitExclusive',
  'splitParallel',
  'splitInclusive',
  'splitEventBased',
  'attachBoundaryTimer',
  'addPool',
  'addLane',
  'addMessageInteraction',
  'addBranch',
  'moveToBranch',
  'renameElement',
  'removeElement',
  'lint',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const READ_ONLY_TOOLS = ['inspectProcess', 'inspectRegion', 'inspectBranch', 'lint'] as const;

export type ReadOnlyTool = (typeof READ_ONLY_TOOLS)[number];

export const AGENT_SCOPE_KINDS = ['process', 'region', 'branch', 'selection'] as const;

export type AgentScopeKind = (typeof AGENT_SCOPE_KINDS)[number];

/** Mutation fence for architect tools. Never includes coordinates. */
export type AgentScope = {
  kind: AgentScopeKind;
  /** Region or branch id when kind is region | branch. */
  id?: string;
  /** Selected element ids when kind is selection. */
  ids?: string[];
};

export type PlanOptions = {
  scope?: AgentScope;
};

export type ToolCall = {
  name: ToolName;
  args: Record<string, unknown>;
};

export type NodeView = {
  id: string;
  type: FlowNodeType;
  name: string;
  bpmnType?: string;
  attachedTo?: string;
  eventDefinition?: string;
};

export type FlowView = {
  id: string;
  source: string;
  target: string;
  name?: string;
  condition?: string;
  isDefault?: boolean;
};

export type BranchView = {
  id: string;
  name: string;
  entryFlowId: string;
  nodeIds: string[];
  locked?: boolean;
};

export type RegionView = {
  id: string;
  type: RegionKind;
  split: string;
  join: string;
  branches: BranchView[];
  nested: RegionView[];
};

/** Semantic snapshot for the LLM. Never includes DI / coordinates. */
export type ProcessView = {
  id: string;
  name: string;
  nodes: NodeView[];
  flows: FlowView[];
  regions: RegionView[];
  unstructured: UnstructuredMark[];
  feedback: FeedbackEdge[];
  exceptionBranches: ExceptionBranch[];
  happyPath: string[];
  participants: Array<{ id: string; name: string; processId?: string }>;
  lanes: Array<{ id: string; name: string; participantId?: string; nodeIds: string[] }>;
  messageFlows: FlowView[];
};

export type ToolResult = Applied & {
  name: ToolName;
  view?: unknown;
};

export type PlanResult = Applied & {
  steps: ToolResult[];
};
