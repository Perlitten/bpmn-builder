import { allRegions, type FlowNodeType, type SemanticProcess, type RegionKind } from '@bpmn/semantic-core';

const REGION: Record<RegionKind, string> = {
  exclusive: 'XOR',
  parallel: 'AND',
  inclusive: 'OR',
  eventBased: 'event-based',
  complex: 'complex',
  subprocess: 'subprocess',
  eventSubprocess: 'event subprocess',
};

const NODE: Record<FlowNodeType, string> = {
  start: 'start',
  end: 'end',
  task: 'task',
  subProcess: 'subprocess',
  exclusiveGateway: 'XOR',
  parallelGateway: 'AND',
  inclusiveGateway: 'OR',
  eventBasedGateway: 'event-based',
  complexGateway: 'complex',
  intermediateCatch: 'catch event',
  intermediateThrow: 'throw event',
  boundaryEvent: 'boundary timer',
};

function named(kind: string, name: string): string {
  const label = name.trim();
  return label ? `${kind} ${label}` : kind;
}

/** Human semantic delta. Never XML / DI. */
export function semanticDiff(before: SemanticProcess, after: SemanticProcess): string[] {
  const lines: string[] = [];
  const prevNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const nextNodes = new Map(after.nodes.map((n) => [n.id, n]));
  const prevRegions = new Map(allRegions(before).map((r) => [r.id, r]));
  const covered = new Set<string>();
  const regionLines: string[] = [];

  for (const region of allRegions(after)) {
    const prev = prevRegions.get(region.id);
    if (!prev) {
      const split = nextNodes.get(region.split);
      regionLines.push(`Added ${named(REGION[region.type], split?.name ?? '')}`);
      covered.add(region.split);
      covered.add(region.join);
      for (const branch of region.branches) {
        regionLines.push(`Added ${named('branch', branch.name)}`);
      }
      continue;
    }
    const known = new Set(prev.branches.map((b) => b.id));
    for (const branch of region.branches) {
      if (!known.has(branch.id)) regionLines.push(`Added ${named('branch', branch.name)}`);
    }
  }

  for (const node of after.nodes) {
    if (prevNodes.has(node.id) || covered.has(node.id)) continue;
    lines.push(`Added ${named(NODE[node.type], node.name)}`);
  }
  lines.push(...regionLines);

  for (const node of after.nodes) {
    const prev = prevNodes.get(node.id);
    if (prev && prev.name !== node.name) {
      lines.push(`Renamed ${prev.name || node.id} → ${node.name || node.id}`);
    }
  }

  for (const node of before.nodes) {
    if (!nextNodes.has(node.id)) {
      lines.push(`Removed ${named(NODE[node.type], node.name)}`);
    }
  }

  return lines;
}
