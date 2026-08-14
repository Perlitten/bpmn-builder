export const CORE_WORKFLOW_NODE_TYPES = [
  'startEvent',
  'endEvent',
  'task',
  'userTask',
  'serviceTask',
  'exclusiveGateway',
] as const;

export type WorkflowNode = {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  data?: Record<string, unknown>;
};
