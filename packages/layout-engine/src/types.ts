export type LayoutNode = {
  id: string;
  type: string;
  name?: string;
  triggeredByEvent?: boolean;
};

export type SequenceFlow = {
  id: string;
  source: string;
  target: string;
  name?: string;
};

/** Ordered path inside a region. Array order is the stable band order. */
export type Branch = {
  id: string;
  /** Flow node ids in visual order, excluding this region's split/join. */
  nodes: string[];
};

export type StructuredRegion = {
  id: string;
  type?: string;
  split: string;
  join: string;
  branches: Branch[];
  nested?: StructuredRegion[];
};

export type LayoutInput = {
  processId?: string;
  nodes: LayoutNode[];
  sequenceFlows: SequenceFlow[];
  regions?: StructuredRegion[];
  participants?: LayoutParticipant[];
  lanes?: LayoutLane[];
  messageFlows?: LayoutMessageFlow[];
  processes?: LayoutProcessGraph[];
};

export type LayoutParticipant = {
  id: string;
  name: string;
  processId?: string;
};

export type LayoutLane = {
  id: string;
  processId: string;
  participantId?: string;
  parentLaneId?: string;
  nodeIds: string[];
};

export type LayoutMessageFlow = {
  id: string;
  source: string;
  target: string;
  name?: string;
};

export type LayoutProcessGraph = {
  id: string;
  nodes: LayoutNode[];
  sequenceFlows: SequenceFlow[];
  regions?: StructuredRegion[];
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type LayoutResult = {
  shapes: Record<string, Bounds>;
  edges: Record<string, Point[]>;
  /** External label DI bounds, keyed by flow-node or flow id. */
  labels: Record<string, Bounds>;
};
