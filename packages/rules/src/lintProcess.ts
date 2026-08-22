import { layoutProcess } from '../../layout-engine/src/index.js';
import { detectStructure, type SemanticProcess } from '../../semantic-core/src/index.js';
import { executionScore, layerExecution } from './execution.js';
import { toLintModel, type Bounds, type LintFlow, type LintModel, type LintNode } from './model.js';
import { hasActionVerb, isPlaceholderName, shouldCheckActionVerb } from './naming.js';
import {
  DEFAULT_EXECUTION_PROFILE,
  GATEWAY_WARN_AT,
  type ExecutionProfile,
  type Finding,
  type LayoutSource,
  type LintOptions,
  type LintResult,
  type LintScores,
} from './types.js';

export function lintProcess(processOrXml: unknown, options: LintOptions = {}): LintResult {
  const model = toLintModel(processOrXml);
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const style: Finding[] = [];
  const suggestions: Finding[] = [];
  const executionProfile = options.executionProfile ?? DEFAULT_EXECUTION_PROFILE;

  if (model.parseError) {
    errors.push({ id: 'bpmn.parse', layer: 1, severity: 'error', message: model.parseError });
    return resultOf(errors, warnings, style, suggestions, 'none', 'none');
  }

  layerBpmn(model, errors);
  if (executionProfile !== 'none') layerExecution(model, executionProfile, warnings);
  layerStyle(model, style);
  const layout = options.geometry === 'skip' ? 'none' : layerGeometry(model, suggestions);
  layerQuality(model, warnings, options.gatewayWarnAt ?? GATEWAY_WARN_AT);

  return resultOf(errors, warnings, style, suggestions, layout, executionProfile);
}

export function scoreParts(result: LintResult): string[] {
  const parts = [`BPMN ${result.scores.bpmn}`, `Style ${result.scores.style}`, `Quality ${result.scores.quality}`];
  if (result.scores.execution !== undefined) parts.push(`Execution ${result.scores.execution}`);
  if (result.layout === 'canonical') parts.push('Layout: canonical');
  else if (result.layout === 'free') parts.push('Layout: free DI');
  return parts;
}

export function formatScores(result: LintResult): string {
  return scoreParts(result).join(' · ');
}

export function allFindings(result: LintResult): Finding[] {
  return [...result.errors, ...result.warnings, ...result.style, ...result.suggestions];
}

function resultOf(
  errors: Finding[],
  warnings: Finding[],
  style: Finding[],
  suggestions: Finding[],
  layout: LayoutSource,
  executionProfile: ExecutionProfile | 'none',
): LintResult {
  const scores: LintScores = {
    bpmn: clamp(100 - errors.filter((f) => f.layer === 1).length * 25),
    style: clamp(100 - style.length * 20),
    quality: clamp(100 - warnings.filter((f) => f.layer === 5).length * 20),
  };
  if (executionProfile !== 'none') scores.execution = executionScore([...errors, ...warnings]);
  if (layout === 'canonical') scores.geometry = 100;
  return { errors, warnings, style, suggestions, scores, layout, executionProfile };
}

function layerBpmn(model: LintModel, errors: Finding[]): void {
  if (!model.nodes.some((n) => n.kind === 'start')) {
    errors.push({ id: 'bpmn.start-required', layer: 1, severity: 'error', message: 'Process has no start event' });
  }
  if (!model.nodes.some((n) => n.kind === 'end')) {
    errors.push({ id: 'bpmn.end-required', layer: 1, severity: 'error', message: 'Process has no end event' });
  }

  const ids = new Set(model.nodes.map((n) => n.id));
  for (const flow of model.flows) {
    if (!flow.source || !flow.target) {
      errors.push({
        id: 'bpmn.flow-source-target',
        layer: 1,
        severity: 'error',
        message: `Sequence flow ${flow.id} is missing source or target`,
        elementId: flow.id,
      });
      continue;
    }
    if (!ids.has(flow.source) || !ids.has(flow.target)) {
      errors.push({
        id: 'bpmn.flow-source-target',
        layer: 1,
        severity: 'error',
        message: `Sequence flow ${flow.id} references a missing node`,
        elementId: flow.id,
      });
    }
  }

  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  for (const flow of model.flows) {
    if (flow.source) outgoing.add(flow.source);
    if (flow.target) incoming.add(flow.target);
  }

  for (const node of model.nodes) {
    const hasIn = incoming.has(node.id);
    const hasOut = outgoing.has(node.id);
    if (model.adHocInnerIds.includes(node.id)) continue;
    if (node.kind === 'start') {
      if (!hasOut) {
        errors.push({
          id: 'bpmn.dangling',
          layer: 1,
          severity: 'error',
          message: `Start event ${label(node)} has no outgoing sequence flow`,
          elementId: node.id,
        });
      }
      continue;
    }
    if (node.kind === 'end') {
      if (!hasIn) {
        errors.push({
          id: 'bpmn.dangling',
          layer: 1,
          severity: 'error',
          message: `End event ${label(node)} has no incoming sequence flow`,
          elementId: node.id,
        });
      }
      continue;
    }
    if (node.coreType === 'boundaryEvent') {
      if (!node.attachedTo || !ids.has(node.attachedTo)) {
        errors.push({
          id: 'bpmn.dangling',
          layer: 1,
          severity: 'error',
          message: `Boundary event ${label(node)} is not attached to an activity`,
          elementId: node.id,
        });
      }
      if (!hasOut && !sequenceOptional(node, model)) {
        errors.push({
          id: 'bpmn.dangling',
          layer: 1,
          severity: 'error',
          message: `Boundary event ${label(node)} has no outgoing sequence flow`,
          elementId: node.id,
        });
      }
      continue;
    }
    if (node.triggeredByEvent || sequenceOptional(node, model)) continue;
    if (!hasIn || !hasOut) {
      errors.push({
        id: 'bpmn.dangling',
        layer: 1,
        severity: 'error',
        message: `${kindTitle(node.kind)} ${label(node)} is not connected`,
        elementId: node.id,
      });
    }
  }
}

function layerStyle(model: LintModel, style: Finding[]): void {
  const outgoing = new Map<string, number>();
  for (const flow of model.flows) {
    if (!flow.source) continue;
    outgoing.set(flow.source, (outgoing.get(flow.source) ?? 0) + 1);
  }

  for (const node of model.nodes) {
    if (isExclusiveXor(node) && (outgoing.get(node.id) ?? 0) >= 2) {
      if (isPlaceholderName(node.name, node.id)) {
        style.push({
          id: 'style.unnamed-xor',
          layer: 3,
          severity: 'style',
          message: `Exclusive gateway ${node.id} has no name`,
          elementId: node.id,
        });
      }
    }
    if (node.kind !== 'task' || node.triggeredByEvent) continue;
    const name = node.name.trim();
    if (!name || isPlaceholderName(name, node.id)) {
      style.push({
        id: 'style.task-verb',
        layer: 3,
        severity: 'style',
        message: `Task ${node.id} has no name`,
        elementId: node.id,
      });
      continue;
    }
    if (shouldCheckActionVerb(name) && !hasActionVerb(name)) {
      style.push({
        id: 'style.task-verb',
        layer: 3,
        severity: 'style',
        message: `Task “${name}” should start with a verb`,
        elementId: node.id,
      });
    }
  }
}

function layerGeometry(model: LintModel, suggestions: Finding[]): LayoutSource {
  if (!model.hasDi) return 'none';

  const labelEntries = Object.entries(model.labels);
  const nodeEntries = Object.entries(model.bounds);

  for (const [labelId, labelBox] of labelEntries) {
    for (const [nodeId, nodeBox] of nodeEntries) {
      if (labelId === nodeId) continue;
      if (overlaps(labelBox, nodeBox)) {
        suggestions.push({
          id: 'geometry.label-overlaps-node',
          layer: 4,
          severity: 'suggestion',
          message: `Label '${labelId}' overlaps node '${nodeId}'`,
          elementId: labelId,
        });
      }
    }
  }

  for (let i = 0; i < labelEntries.length; i++) {
    for (let j = i + 1; j < labelEntries.length; j++) {
      const [id1, box1] = labelEntries[i]!;
      const [id2, box2] = labelEntries[j]!;
      if (overlaps(box1, box2)) {
        suggestions.push({
          id: 'geometry.label-overlaps-label',
          layer: 4,
          severity: 'suggestion',
          message: `Label '${id1}' overlaps label '${id2}'`,
          elementId: id1,
        });
      }
    }
  }

  const flowNodeIds = new Set(model.nodes.map((n) => n.id));
  const flowNodeEntries = nodeEntries.filter(([id]) => flowNodeIds.has(id));

  for (let i = 0; i < flowNodeEntries.length; i++) {
    for (let j = i + 1; j < flowNodeEntries.length; j++) {
      const [id1, box1] = flowNodeEntries[i]!;
      const [id2, box2] = flowNodeEntries[j]!;
      if (overlaps(box1, box2) && !intentionalNodeOverlap(model, id1, box1, id2, box2)) {
        suggestions.push({
          id: 'geometry.node-overlap',
          layer: 4,
          severity: 'suggestion',
          message: `Node '${id1}' overlaps node '${id2}'`,
          elementId: id1,
        });
      }
    }
  }

  if (matchesLayoutEngine(model)) return 'canonical';

  suggestions.push({
    id: 'geometry.free-di',
    layer: 4,
    severity: 'suggestion',
    message: 'Diagram interchange is freeform, not canonical layout-engine output',
  });
  return 'free';
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function intentionalNodeOverlap(
  model: LintModel,
  id1: string,
  box1: Bounds,
  id2: string,
  box2: Bounds,
): boolean {
  const node1 = model.nodes.find((node) => node.id === id1);
  const node2 = model.nodes.find((node) => node.id === id2);
  if (node1?.attachedTo === id2 || node2?.attachedTo === id1) return true;
  if (node1?.kind === 'subprocess' && contains(box1, box2)) return true;
  if (node2?.kind === 'subprocess' && contains(box2, box1)) return true;
  return false;
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function layerQuality(model: LintModel, warnings: Finding[], limit: number): void {
  const outgoing = new Map<string, LintFlow[]>();
  const incomingCount = new Map<string, number>();
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  for (const flow of model.flows) {
    if (flow.source) {
      const list = outgoing.get(flow.source) ?? [];
      list.push(flow);
      outgoing.set(flow.source, list);
    }
    if (flow.target) incomingCount.set(flow.target, (incomingCount.get(flow.target) ?? 0) + 1);
  }

  const reachable = new Set(model.nodes.filter((node) => node.kind === 'start').map((node) => node.id));
  const queue = [...reachable];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const flow of outgoing.get(queue[cursor]!) ?? []) {
      if (!flow.target || reachable.has(flow.target)) continue;
      reachable.add(flow.target);
      queue.push(flow.target);
    }
  }

  for (const node of model.nodes) {
    if (node.kind === 'task' && !node.triggeredByEvent) {
      const name = node.name.trim();
      if (!name || isPlaceholderName(name, node.id)) {
        warnings.push({
          id: 'quality.unnamed-task',
          layer: 5,
          severity: 'warning',
          message: `Task ${node.id} has no name`,
          elementId: node.id,
        });
      }
    }

    if (isDecisionGateway(node)) {
      const flowsOut = outgoing.get(node.id) ?? [];
      if (flowsOut.length >= 2) {
        if (isPlaceholderName(node.name, node.id)) {
          warnings.push({
            id: 'quality.unnamed-gateway',
            layer: 5,
            severity: 'warning',
            message: `Gateway ${node.id} has no name`,
            elementId: node.id,
          });
        }
        for (const flow of flowsOut) {
          if (!flow.name.trim()) {
            warnings.push({
              id: 'quality.unlabeled-branch',
              layer: 5,
              severity: 'warning',
              message: `Sequence flow ${flow.id} from gateway ${node.id} has no label`,
              elementId: flow.id,
            });
          }
        }
      }
    }

    if (node.kind === 'gateway') {
      const flowsOut = outgoing.get(node.id) ?? [];
      if (flowsOut.length >= 2) {
        for (const flow of flowsOut) {
          const target = flow.target ? nodeById.get(flow.target) : undefined;
          if (target?.kind !== 'gateway' || (incomingCount.get(target.id) ?? 0) < 2) continue;
          warnings.push({
            id: 'quality.empty-branch',
            layer: 5,
            severity: 'warning',
            message: `Branch ${flow.name.trim() ? `“${flow.name.trim()}”` : flow.id} contains no activity`,
            elementId: flow.id,
          });
        }
      }
    }

    if (
      node.kind !== 'start' &&
      node.coreType !== 'boundaryEvent' &&
      !node.triggeredByEvent &&
      !model.adHocInnerIds.includes(node.id) &&
      !sequenceOptional(node, model)
    ) {
      if (!reachable.has(node.id)) {
        warnings.push({
          id: 'quality.unreachable-node',
          layer: 5,
          severity: 'warning',
          message: `Node ${label(node)} is not reachable from a start event`,
          elementId: node.id,
        });
      }
    }
  }

  const count = model.nodes.filter((n) => n.kind === 'gateway').length;
  if (count > limit) {
    warnings.push({
      id: 'quality.gateway-count',
      layer: 5,
      severity: 'warning',
      message: `Process has ${count} gateways (limit ${limit})`,
    });
  }
}

function matchesLayoutEngine(model: LintModel): boolean {
  const connected = model.flows.filter((f): f is { id: string; source: string; target: string; name: string } =>
    Boolean(f.source && f.target),
  );
  if (!model.nodes.length) return false;
  const draft: SemanticProcess = {
    id: 'Process_1',
    name: 'Process',
    rootScopeId: 'Scope_1',
    scopes: [
      {
        id: 'Scope_1',
        parentId: null,
        ownerId: null,
        nodeIds: model.nodes.map((n) => n.id),
        flowIds: connected.map((f) => f.id),
      },
    ],
    nodes: model.nodes.map((n) => ({ id: n.id, type: n.coreType, name: n.name })),
    flows: connected.map((f) => ({ id: f.id, source: f.source, target: f.target, name: f.name || undefined })),
    regions: [],
    unstructured: [],
    feedback: [],
    exceptionBranches: [],
    idSeq: {},
    participants: [],
    lanes: [],
    messageFlows: [],
    processes: [],
  };
  const structured = detectStructure(draft);
  const expected = layoutProcess(structured);
  const shapeIds = Object.keys(expected.shapes);
  const labelIds = Object.keys(expected.labels);
  if (!shapeIds.length) return false;
  return (
    shapeIds.every((id) => sameBox(model.bounds[id], expected.shapes[id])) &&
    Object.keys(model.labels).length === labelIds.length &&
    labelIds.every((id) => sameBox(model.labels[id], expected.labels[id]))
  );
}

function sameBox(actual: { x: number; y: number; width: number; height: number } | undefined, expected: { x: number; y: number; width: number; height: number } | undefined): boolean {
  if (!actual || !expected) return false;
  return actual.x === expected.x && actual.y === expected.y && actual.width === expected.width && actual.height === expected.height;
}

function label(node: LintNode): string {
  const name = node.name.trim();
  return name ? `“${name}”` : node.id;
}

function isDecisionGateway(node: LintNode): boolean {
  if (node.kind !== 'gateway') return false;
  const tag = (node.bpmnType ?? node.coreType).replace(/^bpmn:/i, '').toLowerCase();
  return tag === 'exclusivegateway' || tag === 'inclusivegateway';
}

function isExclusiveXor(node: LintNode): boolean {
  return node.kind === 'gateway' && (node.bpmnType ?? 'bpmn:ExclusiveGateway') === 'bpmn:ExclusiveGateway';
}

function sequenceOptional(node: LintNode, model: LintModel): boolean {
  if (node.isForCompensation) return true;
  if (isEventDef(node, 'Compensate') || isEventDef(node, 'Link')) return true;
  const others = model.associations.flatMap((a) => {
    if (a.source === node.id) return a.target ? [a.target] : [];
    if (a.target === node.id) return a.source ? [a.source] : [];
    return [];
  });
  return others.some((id) => model.nodes.find((n) => n.id === id)?.isForCompensation);
}

function isEventDef(node: LintNode, kind: 'Compensate' | 'Link'): boolean {
  const def = node.eventDefinition ?? '';
  return kind === 'Link' ? def === 'LinkEventDefinition' : def === 'CompensateEventDefinition';
}

function kindTitle(kind: LintNode['kind']): string {
  if (kind === 'gateway') return 'Gateway';
  if (kind === 'event') return 'Event';
  if (kind === 'subprocess') return 'Subprocess';
  return 'Task';
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
