import type { ProcessStatus } from './ProcessStatus.js';
import type { WorkflowEdge } from './WorkflowEdge.js';
import type { WorkflowNode } from './WorkflowNode.js';

/** Persisted process DTO. The editable graph IR is `SemanticProcess` from `@bpmn/semantic-core`. */
export type StoredProcess = {
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
  StoredProcess,
  'id' | 'name' | 'description' | 'status' | 'version' | 'createdAt' | 'updatedAt'
> & {
  builtin?: boolean;
  structure: string;
  quality: ProcessQualitySummary;
  preview: ProcessMiniPreview;
};

export type ProcessQualitySummary = {
  errors: number;
  warnings: number;
  style: number;
};

export type ProcessMiniPreview = {
  caption: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    x?: number;
    y?: number;
  }>;
  edges: Array<{ source: string; target: string }>;
};
