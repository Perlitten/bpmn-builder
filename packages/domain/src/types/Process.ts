import type { ProcessStatus } from './ProcessStatus.js';
import type { WorkflowEdge } from './WorkflowEdge.js';
import type { WorkflowNode } from './WorkflowNode.js';

/** Persistence DTO (`bpmnXml`). Graph IR is `@bpmn/semantic-core` `Process`. */
export type Process = {
  id: string;
  name: string;
  description: string | null;
  status: ProcessStatus;
  bpmnXml: string;
  workflowJson: WorkflowDocument | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowDocument = {
  processId?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type ProcessSummary = Pick<
  Process,
  'id' | 'name' | 'description' | 'status' | 'bpmnXml' | 'version' | 'createdAt' | 'updatedAt'
>;
