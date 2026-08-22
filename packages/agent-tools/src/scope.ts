import {
  allRegions,
  bpmnComponentRegistry,
  defaultInsertAfter,
  findBranch,
  findRegion,
  type Branch,
  type SemanticProcess,
  type StructuredRegion,
} from '@bpmn/semantic-core';
import { ToolPlanError } from './errors.js';
import { READ_ONLY_TOOLS, type AgentScope, type AgentScopeKind, type ToolName } from './types.js';

const SCOPE_KINDS = new Set<string>(['process', 'region', 'branch', 'selection']);
const READ_ONLY = new Set<string>(READ_ONLY_TOOLS);
const PROCESS_ONLY = new Set<ToolName>(['addPool', 'addLane', 'addMessageInteraction']);

export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY.has(name);
}

export function parseAgentScope(value: unknown): AgentScope | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ToolPlanError('scope must be an object');
  }
  const row = value as { kind?: unknown; id?: unknown; ids?: unknown };
  if (typeof row.kind !== 'string' || !SCOPE_KINDS.has(row.kind)) {
    throw new ToolPlanError('scope.kind must be process, region, branch, or selection');
  }
  const kind = row.kind as AgentScopeKind;
  if (kind === 'process') return { kind };
  if (kind === 'region' || kind === 'branch') {
    if (typeof row.id !== 'string' || !row.id.trim()) {
      throw new ToolPlanError(`scope.id is required for ${kind} scope`);
    }
    return { kind, id: row.id };
  }
  if (!Array.isArray(row.ids) || row.ids.length === 0 || row.ids.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new ToolPlanError('scope.ids is required for selection scope');
  }
  return { kind, ids: row.ids as string[] };
}

export function describeAgentScope(scope: AgentScope): string {
  if (scope.kind === 'process') return 'whole process';
  if (scope.kind === 'region') return `current region (${scope.id})`;
  if (scope.kind === 'branch') return `current branch (${scope.id})`;
  return `selection (${(scope.ids ?? []).join(', ')})`;
}

export function lockedBranches(process: SemanticProcess): Branch[] {
  return allRegions(process).flatMap((region) => region.branches.filter((branch) => branch.locked));
}

function describeLocks(process: SemanticProcess): string | undefined {
  const locked = lockedBranches(process);
  if (!locked.length) return undefined;
  return locked.map((branch) => `${branch.name || 'branch'} (${branch.id})`).join(', ');
}

function collectRegion(region: StructuredRegion, into: Set<string>): void {
  into.add(region.id);
  into.add(region.split);
  into.add(region.join);
  for (const branch of region.branches) {
    into.add(branch.id);
    into.add(branch.entryFlowId);
    for (const id of branch.nodeIds) into.add(id);
  }
  for (const nested of region.nested) collectRegion(nested, into);
}

function regionHas(region: StructuredRegion, id: string): boolean {
  if (region.id === id || region.split === id || region.join === id) return true;
  if (region.branches.some((branch) => branch.id === id || branch.entryFlowId === id || branch.nodeIds.includes(id))) {
    return true;
  }
  return region.nested.some((nested) => regionHas(nested, id));
}

function branchHas(branch: Branch, id: string): boolean {
  return branch.id === id || branch.entryFlowId === id || branch.nodeIds.includes(id);
}

function findOwningBranch(process: SemanticProcess, id: string): { region: StructuredRegion; branch: Branch } | undefined {
  for (const region of allRegions(process)) {
    if (region.split === id || region.join === id || region.id === id) continue;
    const branch = region.branches.find((item) => branchHas(item, id));
    if (branch) return { region, branch };
  }
}

function isLockedTarget(process: SemanticProcess, id: string): boolean {
  const hit = findOwningBranch(process, id);
  return Boolean(hit?.branch.locked);
}

function nestedOnBranch(region: StructuredRegion, branch: Branch): StructuredRegion[] {
  return region.nested.filter((nested) => branch.nodeIds.includes(nested.split));
}

function mutableIds(process: SemanticProcess, scope: AgentScope | undefined): Set<string> | null {
  if (!scope || scope.kind === 'process') return null;
  const ids = new Set<string>();
  if (scope.kind === 'region') {
    collectRegion(findRegion(process, scope.id!), ids);
    return ids;
  }
  if (scope.kind === 'branch') {
    const { region, branch } = findBranch(process, scope.id!);
    ids.add(branch.id);
    ids.add(branch.entryFlowId);
    for (const id of branch.nodeIds) ids.add(id);
    for (const nested of nestedOnBranch(region, branch)) collectRegion(nested, ids);
    return ids;
  }
  for (const id of scope.ids ?? []) ids.add(id);
  return ids;
}

function inMutable(process: SemanticProcess, scope: AgentScope | undefined, id: string): boolean {
  if (isLockedTarget(process, id)) return false;
  const allowed = mutableIds(process, scope);
  if (!allowed) return true;
  return allowed.has(id);
}

function canInsertAfter(
  process: SemanticProcess,
  scope: AgentScope | undefined,
  afterId: string,
  branchId?: string,
): boolean {
  if (branchId && isLockedTarget(process, branchId)) return false;
  if (isLockedTarget(process, afterId) && !(scope?.kind === 'branch' && branchId === scope.id)) return false;
  if (!scope || scope.kind === 'process') {
    if (branchId) return inMutable(process, scope, branchId);
    return inMutable(process, scope, afterId);
  }
  if (scope.kind === 'selection') return (scope.ids ?? []).includes(afterId);
  if (scope.kind === 'region') {
    const region = findRegion(process, scope.id!);
    if (branchId) {
      const hit = region.branches.find((branch) => branch.id === branchId) ?? findNestedBranch(region, branchId);
      return Boolean(hit) && !hit!.locked;
    }
    return regionHas(region, afterId);
  }
  const { region, branch } = findBranch(process, scope.id!);
  if (branch.locked) return false;
  if (branchId && branchId !== branch.id && !nestedOnBranch(region, branch).some((nested) => nested.branches.some((item) => item.id === branchId))) {
    return false;
  }
  if (branch.nodeIds.includes(afterId) || afterId === branch.id || afterId === branch.entryFlowId) return true;
  return afterId === region.split && (!branchId || branchId === branch.id);
}

function findNestedBranch(region: StructuredRegion, branchId: string): Branch | undefined {
  for (const branch of region.branches) {
    if (branch.id === branchId) return branch;
  }
  for (const nested of region.nested) {
    const hit = findNestedBranch(nested, branchId);
    if (hit) return hit;
  }
}

function canInsertBefore(
  process: SemanticProcess,
  scope: AgentScope | undefined,
  beforeId: string,
  branchId?: string,
): boolean {
  if (canInsertAfter(process, scope, beforeId, branchId)) return true;
  if (scope?.kind !== 'branch' || !scope.id) return false;
  const { region, branch } = findBranch(process, scope.id);
  if (branch.locked) return false;
  return beforeId === region.join && (!branchId || branchId === branch.id);
}

function refuse(name: ToolName, reason: string): never {
  throw new ToolPlanError(`${name} ${reason}`);
}

const PLACE_TOOLS = new Set<ToolName>([
  'addTask',
  'addAfter',
  'addBefore',
  'splitExclusive',
  'splitParallel',
  'splitInclusive',
  'splitEventBased',
  'splitComplex',
  'createComponent',
  'moveToBranch',
]);

function processWide(scope: AgentScope | undefined): boolean {
  return !scope || scope.kind === 'process';
}

function regionById(process: SemanticProcess, id: string): StructuredRegion | undefined {
  return allRegions(process).find((region) => region.id === id);
}

function branchById(process: SemanticProcess, id: string): Branch | undefined {
  for (const region of allRegions(process)) {
    const hit = region.branches.find((branch) => branch.id === id);
    if (hit) return hit;
  }
}

function happyBranchOf(process: SemanticProcess, region: StructuredRegion): Branch | undefined {
  const def = process.flows.find((flow) => flow.source === region.split && flow.isDefault);
  if (def) {
    const hit = region.branches.find((branch) => branch.entryFlowId === def.id && !branch.locked);
    if (hit) return hit;
  }
  return region.branches.find((branch) => !branch.locked) ?? region.branches[0];
}

function lookupPlaceRef(
  process: SemanticProcess,
  ref: string,
  lastId?: string,
): { kind: 'branch' | 'region' | 'node'; id: string } | undefined {
  if (ref === '$last' || ref === '$id') {
    if (!lastId) return undefined;
    return lookupPlaceRef(process, lastId);
  }
  if (branchById(process, ref)) return { kind: 'branch', id: ref };
  if (regionById(process, ref)) return { kind: 'region', id: ref };
  if (process.nodes.some((node) => node.id === ref) || process.flows.some((flow) => flow.id === ref)) {
    return { kind: 'node', id: ref };
  }
  if ((process.artifacts ?? []).some((item) => item.id === ref)) {
    return { kind: 'node', id: ref };
  }
  const namedBranches = allRegions(process).flatMap((region) => region.branches.filter((branch) => branch.name === ref));
  if (namedBranches.length === 1) return { kind: 'branch', id: namedBranches[0]!.id };
  const namedNodes = process.nodes.filter((node) => node.name === ref);
  if (namedNodes.length === 1) return { kind: 'node', id: namedNodes[0]!.id };
}

/** Map region ids / $last / hallucinated branch pins to a legal insert. */
function rewritePlaceArgs(
  name: ToolName,
  args: Record<string, unknown>,
  process: SemanticProcess,
  lastId: string | undefined,
  scope: AgentScope | undefined,
): Record<string, unknown> {
  if (!PLACE_TOOLS.has(name)) return args;
  const next = { ...args };
  const read = (key: string): string | undefined => {
    const value = next[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  };

  const afterRaw = read('after');
  if (afterRaw) {
    const hit = lookupPlaceRef(process, afterRaw, lastId);
    if (hit?.kind === 'region') {
      const region = regionById(process, hit.id)!;
      if (processWide(scope)) {
        next.after = region.join;
        delete next.branchId;
      } else {
        const happy = happyBranchOf(process, region);
        next.after = region.split;
        if (happy) next.branchId = happy.id;
      }
    }
  }

  const beforeRaw = read('before');
  if (beforeRaw) {
    const hit = lookupPlaceRef(process, beforeRaw, lastId);
    if (hit?.kind === 'region') next.before = regionById(process, hit.id)!.split;
  }

  const branchRaw = read('branchId');
  if (branchRaw) {
    const hit = lookupPlaceRef(process, branchRaw, lastId);
    if (hit?.kind === 'branch') {
      next.branchId = hit.id;
    } else if (hit?.kind === 'region') {
      if (processWide(scope)) {
        delete next.branchId;
      } else {
        const happy = happyBranchOf(process, regionById(process, hit.id)!);
        if (happy) next.branchId = happy.id;
        else delete next.branchId;
      }
    } else if (processWide(scope)) {
      delete next.branchId;
    }
  }

  return next;
}

export function applyScopeDefaults(
  name: ToolName,
  args: Record<string, unknown>,
  scope: AgentScope | undefined,
  ctx?: { process: SemanticProcess; lastId?: string },
): Record<string, unknown> {
  const placed = ctx?.process ? rewritePlaceArgs(name, args, ctx.process, ctx.lastId, scope) : args;
  if (!scope) return placed;
  if (name !== 'addTask' && name !== 'createComponent') return placed;
  if (placed.after != null || placed.before != null || placed.branchId != null) return placed;
  if (scope.kind === 'branch' && scope.id) return { ...placed, branchId: scope.id };
  if (scope.kind === 'selection' && scope.ids?.length === 1) return { ...placed, after: scope.ids[0] };
  if (scope.kind === 'region' && scope.id && ctx?.process) {
    const region = regionById(ctx.process, scope.id);
    const happy = region ? happyBranchOf(ctx.process, region) : undefined;
    if (happy) return { ...placed, branchId: happy.id };
  }
  return placed;
}

export function assertMutationAllowed(
  process: SemanticProcess,
  name: ToolName,
  args: Record<string, unknown>,
  lastId: string | undefined,
  resolve: (ref: string) => string,
  scope?: AgentScope,
): void {
  if (isReadOnlyTool(name)) return;
  if (scope) parseAgentScope(scope);
  if (PROCESS_ONLY.has(name) && scope && scope.kind !== 'process') {
    refuse(name, 'requires whole-process scope');
  }

  const ref = (key: string): string | undefined => {
    const value = args[key];
    if (typeof value !== 'string' || !value.trim()) return undefined;
    if (value === '$last' || value === '$id') {
      if (!lastId) throw new ToolPlanError('$last is not set');
      return lastId;
    }
    return resolve(value);
  };

  const after = ref('after');
  const before = ref('before');
  const branchId = ref('branchId');
  const regionId = ref('regionId');
  const nodeId = ref('nodeId');
  const id = ref('id');
  const on = ref('on');
  const from = ref('from');
  const to = ref('to');
  const associateTo = ref('associateTo');
  const flowId = ref('flowId');
  const parent = ref('parent');

  for (const target of [after, before, branchId, regionId, nodeId, id, on, from, to, associateTo, flowId, parent]) {
    if (target && isLockedTarget(process, target)) {
      refuse(name, 'cannot mutate a branch protected from AI');
    }
  }

  if (name === 'addTask' || name === 'addAfter' || name === 'addBefore') {
    if (after && !canInsertAfter(process, scope, after, branchId)) {
      refuse(name, 'is outside agent scope (after)');
    }
    if (before && !canInsertBefore(process, scope, before, branchId)) {
      refuse(name, 'is outside agent scope (before)');
    }
    if (branchId && !inMutable(process, scope, branchId) && !(scope?.kind === 'branch' && scope.id === branchId)) {
      refuse(name, 'is outside agent scope (branch)');
    }
    if (!after && !before && !branchId) {
      const point = defaultInsertAfter(process);
      if (!canInsertAfter(process, scope, point)) refuse(name, 'is outside agent scope (insert point)');
    }
    return;
  }

  if (
    name === 'splitExclusive' ||
    name === 'splitParallel' ||
    name === 'splitInclusive' ||
    name === 'splitEventBased' ||
    name === 'splitComplex'
  ) {
    if (!after || !canInsertAfter(process, scope, after, branchId)) {
      refuse(name, 'is outside agent scope (after)');
    }
    return;
  }

  if (name === 'attachBoundaryTimer' || name === 'attachBoundaryError') {
    const host = on ?? after;
    if (!host || !inMutable(process, scope, host)) refuse(name, 'is outside agent scope');
    return;
  }

  if (name === 'createEventSubprocess') {
    const host = parent ?? after;
    if (host) {
      if (!inMutable(process, scope, host)) refuse(name, 'is outside agent scope');
      return;
    }
    if (scope && scope.kind !== 'process') refuse(name, 'requires whole-process scope');
    return;
  }

  if (name === 'createComponent') {
    const componentId = typeof args.componentId === 'string' ? args.componentId : '';
    const def = bpmnComponentRegistry.get(componentId);
    if (!def) refuse(name, 'cannot add that construction');
    if (!def.implemented) return;
    const place = def.layoutBehavior.placement;
    if (place === 'pool' || place === 'lane' || place === 'messageFlow') {
      if (scope && scope.kind !== 'process') refuse(name, 'requires whole-process scope');
      return;
    }
    if (def.id.startsWith('start.') || def.id.startsWith('end.')) {
      if (scope && scope.kind !== 'process') refuse(name, 'requires whole-process scope');
      return;
    }
    if (place === 'data' || place === 'artifact') return;
    if (place === 'attachToActivityBoundary') {
      const host = on ?? after;
      if (!host || !inMutable(process, scope, host)) refuse(name, 'is outside agent scope');
      return;
    }
    if (place === 'sequenceFlow' || place === 'association') {
      const target = flowId ?? after ?? from ?? to ?? id;
      if (target && !inMutable(process, scope, target)) refuse(name, 'is outside agent scope');
      return;
    }
    if (after && !canInsertAfter(process, scope, after, branchId)) {
      refuse(name, 'is outside agent scope (after)');
    }
    if (before && !canInsertBefore(process, scope, before, branchId)) {
      refuse(name, 'is outside agent scope (before)');
    }
    if (branchId && !inMutable(process, scope, branchId) && !(scope?.kind === 'branch' && scope.id === branchId)) {
      refuse(name, 'is outside agent scope (branch)');
    }
    if (!after && !before && !branchId) {
      const point = defaultInsertAfter(process);
      if (!canInsertAfter(process, scope, point)) refuse(name, 'is outside agent scope (insert point)');
    }
    return;
  }

  if (name === 'setFlowKind') {
    const target = flowId ?? id ?? after;
    if (!target || !inMutable(process, scope, target)) refuse(name, 'is outside agent scope');
    return;
  }

  if (name === 'setCalledElement') {
    if (!id || !inMutable(process, scope, id)) refuse(name, 'is outside agent scope');
    return;
  }

  if (name === 'addTextAnnotation') {
    const host = associateTo ?? after;
    if (host && !inMutable(process, scope, host)) refuse(name, 'is outside agent scope');
    return;
  }

  if (name === 'addAssociation') {
    for (const target of [from, to, after]) {
      if (target && !inMutable(process, scope, target)) refuse(name, 'is outside agent scope');
    }
    return;
  }

  if (name === 'addBranch') {
    if (!regionId || !inMutable(process, scope, regionId)) refuse(name, 'is outside agent scope (region)');
    if (scope?.kind === 'branch') refuse(name, 'is outside agent scope (region)');
    return;
  }

  if (name === 'moveToBranch') {
    if (!nodeId || !inMutable(process, scope, nodeId)) refuse(name, 'is outside agent scope (node)');
    if (!branchId || !canInsertAfter(process, scope, branchId, branchId)) {
      refuse(name, 'is outside agent scope (branch)');
    }
    return;
  }

  if (name === 'assignLane') {
    if (!nodeId || !inMutable(process, scope, nodeId)) refuse(name, 'is outside agent scope (node)');
    return;
  }

  if (name === 'renameElement' || name === 'removeElement') {
    const target = id;
    if (!target || !inMutable(process, scope, target)) refuse(name, 'is outside agent scope');
    return;
  }
}

function lockKey(process: SemanticProcess, branch: Branch): string {
  const nodes = branch.nodeIds.map((id) => {
    const node = process.nodes.find((item) => item.id === id);
    return node ? `${node.id}:${node.name}:${node.type}` : id;
  });
  return `${branch.id}:${branch.name}:${branch.entryFlowId}:${nodes.join(',')}`;
}

export function assertLocksIntact(before: SemanticProcess, after: SemanticProcess, name: ToolName): void {
  const prev = new Map(
    lockedBranches(before).map((branch) => [branch.id, lockKey(before, branch)]),
  );
  if (!prev.size) return;
  const next = new Map(lockedBranches(after).map((branch) => [branch.id, lockKey(after, branch)]));
  for (const [id, key] of prev) {
    if (next.get(id) !== key) refuse(name, 'cannot mutate a branch protected from AI');
  }
}

function branchMutable(process: SemanticProcess, scope: AgentScope | undefined, branch: Branch, region: StructuredRegion): boolean {
  if (branch.locked) return false;
  if (!scope || scope.kind === 'process') return true;
  if (scope.kind === 'branch') {
    if (scope.id === branch.id) return true;
    const scoped = findBranch(process, scope.id!);
    return nestedOnBranch(scoped.region, scoped.branch).some((nested) => nested.id === region.id || regionHas(nested, branch.id));
  }
  if (scope.kind === 'region') return regionHas(findRegion(process, scope.id!), branch.id);
  return (scope.ids ?? []).some((id) => branchHas(branch, id) || id === region.split || id === region.join);
}

export function assertOutsideScopeIntact(before: SemanticProcess, after: SemanticProcess, name: ToolName, scope?: AgentScope): void {
  for (const node of before.nodes) {
    if (inMutable(before, scope, node.id)) continue;
    const next = after.nodes.find((item) => item.id === node.id);
    if (!next) refuse(name, 'is outside agent scope');
    if (next.name !== node.name || next.type !== node.type || next.bpmnType !== node.bpmnType) {
      refuse(name, 'is outside agent scope');
    }
  }
  for (const region of allRegions(before)) {
    for (const branch of region.branches) {
      if (branchMutable(before, scope, branch, region)) continue;
      const next = allRegions(after)
        .flatMap((item) => item.branches)
        .find((item) => item.id === branch.id);
      if (!next || lockKey(before, branch) !== lockKey(after, next)) {
        refuse(name, 'is outside agent scope');
      }
    }
  }
}

export function scopePromptLines(process?: SemanticProcess, scope?: AgentScope): string[] {
  const lines: string[] = [];
  if (scope) lines.push(`Active agent scope: ${describeAgentScope(scope)}. Mutations outside this scope are rejected.`);
  if (process) {
    const locks = describeLocks(process);
    if (locks) lines.push(`Protected from AI (do not mutate): ${locks}.`);
  }
  return lines;
}
