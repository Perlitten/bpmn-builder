import type { ValidationIssue } from '../types/ValidationIssue.js';
import type { WorkflowDocument } from '../types/StoredProcess.js';
import type { WorkflowEdge } from '../types/WorkflowEdge.js';
import type { WorkflowNode } from '../types/WorkflowNode.js';
import { isNonEmptyString } from './isNonEmptyString.js';

export type WorkflowValidationResult =
  | { ok: true; workflow: WorkflowDocument; issues: ValidationIssue[] }
  | { ok: false; error: string; issues: ValidationIssue[] };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(issues: ValidationIssue[]): WorkflowValidationResult {
  return { ok: false, error: issues[0]?.message ?? 'invalid workflow', issues };
}

function asNode(value: unknown, index: number, issues: ValidationIssue[]): WorkflowNode | null {
  if (!isPlainObject(value)) {
    issues.push({ code: 'invalid_node_shape', message: `Node at index ${index} is not an object.` });
    return null;
  }
  if (!isNonEmptyString(value.id)) {
    issues.push({ code: 'invalid_node_id', message: `Node at index ${index} is missing a string id.` });
    return null;
  }
  if (!isNonEmptyString(value.type)) {
    issues.push({
      code: 'invalid_node_type',
      nodeId: value.id,
      message: `Node "${value.id}" is missing a type.`,
    });
    return null;
  }
  if (value.data != null && !isPlainObject(value.data)) {
    issues.push({
      code: 'invalid_node_data',
      nodeId: value.id,
      message: `Node "${value.id}" data must be an object.`,
    });
  }
  const x = typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : undefined;
  const y = typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : undefined;
  return {
    id: value.id.trim(),
    type: value.type.trim(),
    label: typeof value.label === 'string' ? value.label : '',
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(isPlainObject(value.data) ? { data: value.data } : {}),
  };
}

function asEdge(value: unknown, index: number, issues: ValidationIssue[]): WorkflowEdge | null {
  if (!isPlainObject(value)) {
    issues.push({ code: 'invalid_edge_shape', message: `Edge at index ${index} is not an object.` });
    return null;
  }
  if (!isNonEmptyString(value.id)) {
    issues.push({ code: 'invalid_edge_id', message: `Edge at index ${index} is missing a string id.` });
    return null;
  }
  if (!isNonEmptyString(value.source) || !isNonEmptyString(value.target)) {
    issues.push({
      code: 'invalid_edge_endpoints',
      message: `Edge ${value.id} must have string source/target.`,
    });
    return null;
  }
  return {
    id: value.id.trim(),
    source: value.source.trim(),
    target: value.target.trim(),
    ...(typeof value.label === 'string' && value.label ? { label: value.label } : {}),
    ...(typeof value.condition === 'string' && value.condition
      ? { condition: value.condition }
      : {}),
  };
}

function collectPublishIssues(workflow: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const starts = workflow.nodes.filter((node) => node.type === 'startEvent');
  const ends = workflow.nodes.filter((node) => node.type === 'endEvent');
  if (!starts.length) {
    issues.push({ code: 'missing_start_event', message: 'Published process needs a start event.' });
  }
  if (!ends.length) {
    issues.push({ code: 'missing_end_event', message: 'Published process needs an end event.' });
  }

  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of workflow.edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  for (const node of workflow.nodes) {
    if (node.type === 'exclusiveGateway' && (outgoing.get(node.id)?.length ?? 0) < 2) {
      issues.push({
        code: 'gateway_needs_branches',
        nodeId: node.id,
        message: `Exclusive gateway "${node.id}" needs at least two outgoing sequence flows.`,
      });
    }
    if (node.type !== 'endEvent' && !(outgoing.get(node.id)?.length)) {
      issues.push({
        code: 'missing_outgoing',
        nodeId: node.id,
        message: `Node "${node.id}" has no outgoing sequence flow.`,
      });
    }
  }

  const reachable = new Set<string>();
  const queue = starts.map((node) => node.id);
  while (queue.length) {
    const id = queue.shift();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    for (const edge of outgoing.get(id) ?? []) queue.push(edge.target);
  }
  for (const node of workflow.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        code: 'unreachable_node',
        nodeId: node.id,
        message: `Node "${node.id}" is unreachable from a start event.`,
      });
    }
  }

  return issues;
}

export function validateWorkflowDocument(
  input: unknown,
  options: { mode?: 'draft' | 'publish' } = {},
): WorkflowValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(input)) {
    return fail([{ code: 'invalid_payload', message: 'Workflow must be a JSON object.' }]);
  }
  if (!Array.isArray(input.nodes)) {
    issues.push({ code: 'invalid_nodes', message: 'Workflow nodes must be an array.' });
  }
  if (!Array.isArray(input.edges)) {
    issues.push({ code: 'invalid_edges', message: 'Workflow edges must be an array.' });
  }
  if (issues.length) return fail(issues);

  const nodeIds = new Set<string>();
  const nodes: WorkflowNode[] = [];
  (input.nodes as unknown[]).forEach((raw, index) => {
    const node = asNode(raw, index, issues);
    if (!node) return;
    if (nodeIds.has(node.id)) {
      issues.push({ code: 'duplicate_node_id', nodeId: node.id, message: `Duplicate node id "${node.id}".` });
      return;
    }
    nodeIds.add(node.id);
    nodes.push(node);
  });

  const edgeIds = new Set<string>();
  const edges: WorkflowEdge[] = [];
  (input.edges as unknown[]).forEach((raw, index) => {
    const edge = asEdge(raw, index, issues);
    if (!edge) return;
    if (edgeIds.has(edge.id)) {
      issues.push({ code: 'duplicate_edge_id', message: `Duplicate edge id "${edge.id}".` });
      return;
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) {
      issues.push({
        code: 'edge_source_missing',
        message: `Edge ${edge.id}: source node "${edge.source}" does not exist.`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        code: 'edge_target_missing',
        nodeId: edge.target,
        message: `Edge ${edge.id}: target node "${edge.target}" does not exist.`,
      });
    }
    edges.push(edge);
  });

  const workflow: WorkflowDocument = {
    ...(typeof input.processId === 'string' && input.processId.trim()
      ? { processId: input.processId.trim() }
      : {}),
    nodes,
    edges,
  };

  if (options.mode === 'publish') issues.push(...collectPublishIssues(workflow));
  if (issues.length) return fail(issues);
  return { ok: true, workflow, issues };
}
