import type { SemanticProcess, StructuredRegion as CoreRegion } from '../../semantic-core/src/index.js';
import type { Branch, LayoutArtifact, LayoutInput, LayoutNode, SequenceFlow, StructuredRegion } from './types.js';

type Dict = Record<string, unknown>;

function obj(value: unknown): Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function idOf(value: unknown): string {
  if (typeof value === 'string') return value;
  return String(obj(value).id ?? '');
}

function refId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const rec = obj(value);
  if (typeof rec.$ref === 'string' && rec.$ref.trim()) return rec.$ref.trim();
  if (typeof rec.id === 'string' && rec.id.trim()) return rec.id.trim();
  return undefined;
}

function artifactsFromExtras(extras: unknown[]): LayoutArtifact[] {
  const out: LayoutArtifact[] = [];
  for (const raw of extras) {
    const item = obj(raw);
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;
    const type = String(item.$type ?? '');
    if (type.endsWith(':Association') || /:Data(?:Input|Output)?Association$/i.test(type)) {
      out.push({
        id,
        kind: 'association',
        ...(refId(item.sourceRef) ? { source: refId(item.sourceRef) } : {}),
        ...(refId(item.targetRef) ? { target: refId(item.targetRef) } : {}),
      });
      continue;
    }
    const name =
      typeof item.name === 'string' && item.name.trim()
        ? item.name
        : typeof item.text === 'string' && item.text.trim()
          ? item.text
          : undefined;
    let kind: LayoutArtifact['kind'] | undefined;
    if (type.endsWith(':DataObjectReference') || type.endsWith(':DataObject')) kind = 'dataObject';
    else if (type.endsWith(':DataStoreReference') || type.endsWith(':DataStore')) kind = 'dataStore';
    else if (type.endsWith(':TextAnnotation')) kind = 'textAnnotation';
    else if (type.endsWith(':Group')) kind = 'group';
    if (kind) out.push({ id, kind, ...(name ? { name } : {}) });
  }
  return out;
}

function optionalName(value: Dict): string | undefined {
  const name = typeof value.name === 'string' ? value.name : typeof value.label === 'string' ? value.label : '';
  return name.trim() ? name : undefined;
}

function asNode(value: unknown): LayoutNode {
  const n = obj(value);
  const name = optionalName(n);
  return {
    id: idOf(n),
    type: String(n.type ?? n.kind ?? 'task'),
    ...(name ? { name } : {}),
    ...(n.triggeredByEvent ? { triggeredByEvent: true } : {}),
    ...(typeof n.attachedTo === 'string' && n.attachedTo ? { attachedTo: n.attachedTo } : {}),
  };
}

function asFlow(value: unknown): SequenceFlow {
  const f = obj(value);
  const name = optionalName(f);
  return {
    id: idOf(f),
    source: String(f.source ?? f.sourceRef ?? ''),
    target: String(f.target ?? f.targetRef ?? ''),
    ...(name ? { name } : {}),
  };
}

function asBranch(value: unknown, index: number): Branch {
  const b = obj(value);
  const nodes = arr(b.nodes ?? b.nodeIds ?? b.flowNodeIds ?? b.elements).map(idOf).filter(Boolean);
  const entryFlowId = typeof b.entryFlowId === 'string' && b.entryFlowId ? b.entryFlowId : undefined;
  return { id: b.id != null ? String(b.id) : `branch_${index}`, nodes, ...(entryFlowId ? { entryFlowId } : {}) };
}

function asRegion(value: unknown, index: number): StructuredRegion {
  const r = obj(value);
  const split = idOf(r.split);
  const join = idOf(r.join);
  const nested = arr(r.nested).map(asRegion);
  return {
    id: r.id != null ? String(r.id) : `${split}->${join || index}`,
    ...(r.type != null ? { type: String(r.type) } : {}),
    split,
    join,
    branches: arr(r.branches).map(asBranch),
    ...(nested.length ? { nested } : {}),
  };
}

function fromCoreRegion(region: CoreRegion): StructuredRegion {
  return {
    id: region.id,
    type: region.type,
    split: region.split,
    join: region.join,
    branches: region.branches.map((b) => ({
      id: b.id,
      nodes: b.nodeIds,
      ...(b.entryFlowId ? { entryFlowId: b.entryFlowId } : {}),
    })),
    nested: region.nested.map(fromCoreRegion),
  };
}

function isSemanticProcess(value: unknown): value is SemanticProcess {
  if (value === null || typeof value !== 'object') return false;
  const p = value as SemanticProcess;
  return Array.isArray(p.nodes) && Array.isArray(p.flows) && Array.isArray(p.regions);
}

/** Maps @bpmn/semantic-core SemanticProcess onto LayoutInput. */
export function fromSemanticProcess(process: SemanticProcess | unknown): LayoutInput {
  if (isSemanticProcess(process)) {
    return {
      processId: process.id,
      nodes: process.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        ...(n.name ? { name: n.name } : {}),
        ...(n.triggeredByEvent ? { triggeredByEvent: true } : {}),
        ...(n.attachedTo ? { attachedTo: n.attachedTo } : {}),
      })),
      sequenceFlows: process.flows.map((f) => ({
        id: f.id,
        source: f.source,
        target: f.target,
        ...(f.name ? { name: f.name } : {}),
      })),
      regions: process.regions.map(fromCoreRegion),
      participants: (process.participants ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        ...(p.processId ? { processId: p.processId } : {}),
      })),
      lanes: (process.lanes ?? []).map((l) => ({
        id: l.id,
        processId: l.processId,
        ...(l.participantId ? { participantId: l.participantId } : {}),
        ...(l.parentLaneId ? { parentLaneId: l.parentLaneId } : {}),
        nodeIds: [...l.nodeIds],
      })),
      messageFlows: (process.messageFlows ?? []).map((m) => ({
        id: m.id,
        source: m.source,
        target: m.target,
        ...(m.name ? { name: m.name } : {}),
      })),
      artifacts: artifactsFromExtras([
        ...(process.artifacts ?? []),
        ...(process.collaborationArtifacts ?? []),
      ]),
      processes: (process.processes ?? []).map((g) => ({
        id: g.id,
        nodes: g.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          ...(n.name ? { name: n.name } : {}),
          ...(n.triggeredByEvent ? { triggeredByEvent: true } : {}),
          ...(n.attachedTo ? { attachedTo: n.attachedTo } : {}),
        })),
        sequenceFlows: g.flows.map((f) => ({
          id: f.id,
          source: f.source,
          target: f.target,
          ...(f.name ? { name: f.name } : {}),
        })),
        regions: g.regions.map(fromCoreRegion),
        artifacts: artifactsFromExtras(g.artifacts ?? []),
      })),
    };
  }

  const p = obj(process);
  const root = obj(p.root);
  const scope =
    root.flowNodes || root.nodes || root.sequenceFlows
      ? root
      : obj(p.scope).flowNodes || obj(p.scope).nodes
        ? obj(p.scope)
        : p;
  return {
    nodes: arr(scope.nodes ?? scope.flowNodes ?? p.nodes ?? p.flowNodes).map(asNode),
    sequenceFlows: arr(
      scope.sequenceFlows ?? scope.flows ?? p.sequenceFlows ?? p.flows ?? p.edges,
    ).map(asFlow),
    regions: arr(scope.regions ?? p.regions).map(asRegion),
  };
}
