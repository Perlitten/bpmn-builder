export type { Process, ProcessSummary, WorkflowDocument } from './types/Process.js';
export type {
  Process as SemanticProcess,
  Scope,
  FlowNode,
  SequenceFlow,
  StructuredRegion,
  Branch,
  UnstructuredMark,
} from '../../semantic-core/src/index.js';
export type { ProcessStatus } from './types/ProcessStatus.js';
export type { ValidationIssue } from './types/ValidationIssue.js';
export type { WorkflowEdge } from './types/WorkflowEdge.js';
export type { WorkflowNode } from './types/WorkflowNode.js';
export { CORE_WORKFLOW_NODE_TYPES } from './types/WorkflowNode.js';
export type { ProcessPatch, ProcessValidationResult } from './validation/validateProcess.js';
export { validateProcess, validateProcessPatch, PROCESS_NAME_MAX, PROCESS_DESCRIPTION_MAX, PROCESS_BPMN_XML_MAX } from './validation/validateProcess.js';
export { copyProcessName } from './copyProcessName.js';
export { validateWorkflowDocument } from './validation/validateWorkflow.js';
export { isProcessStatus } from './validation/isProcessStatus.js';
