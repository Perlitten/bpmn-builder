import { lintProcess } from '../../rules/src/index.js';
import {
  BPMN,
  addAfter as coreAddAfter,
  addBefore as coreAddBefore,
  addBranch as coreAddBranch,
  addTask as coreAddTask,
  addLane as coreAddLane,
  addMessageInteraction as coreAddMessageInteraction,
  addPool as coreAddPool,
  allRegions,
  bpmnComponentRegistry,
  createFromComponent,
  moveToBranch as coreMoveToBranch,
  removeElement as coreRemoveElement,
  renameElement as coreRenameElement,
  splitExclusive as coreSplitExclusive,
  splitInclusive as coreSplitInclusive,
  splitEventBased as coreSplitEventBased,
  splitParallel as coreSplitParallel,
  attachBoundaryTimer as coreAttachBoundaryTimer,
  type FlowNodeType,
  type PlaceSpec,
  type Process,
} from '../../semantic-core/src/index.js';
import { ToolPlanError } from './errors.js';
import { assertNoGeometry } from './geometry.js';
import { inspectBranchView, inspectRegionView, processView } from './inspect.js';
import {
  applyScopeDefaults,
  assertLocksIntact,
  assertMutationAllowed,
  assertOutsideScopeIntact,
  isReadOnlyTool,
  scopePromptLines,
} from './scope.js';
import type { PlanOptions, PlanResult, ToolCall, ToolName, ToolResult } from './types.js';
import { TOOL_NAMES } from './types.js';

const TOOL_NAME_SET = new Set<string>(TOOL_NAMES);

const TASK_BPMN = new Set<string>([
  BPMN.task,
  BPMN.userTask,
  BPMN.serviceTask,
  BPMN.sendTask,
  BPMN.receiveTask,
  BPMN.manualTask,
  BPMN.businessRuleTask,
  BPMN.scriptTask,
  BPMN.callActivity,
]);

const GATEWAY_TOOLS: Record<string, 'splitExclusive' | 'splitParallel' | 'splitInclusive' | 'splitEventBased'> = {
  'gateway.exclusive': 'splitExclusive',
  'gateway.parallel': 'splitParallel',
  'gateway.inclusive': 'splitInclusive',
  'gateway.eventBased': 'splitEventBased',
};

const ARG_ALIASES: Record<string, string> = {
  afterId: 'after',
  beforeId: 'before',
  elementId: 'id',
};

function unchanged(process: Process, name: ToolName, view: unknown): ToolResult {
  return { name, process, inverse: () => process, id: process.id, view };
}

function wrap(name: ToolName, applied: { process: Process; inverse: (current: Process) => Process; id: string }): ToolResult {
  return { name, process: applied.process, inverse: applied.inverse, id: applied.id };
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value == null) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ToolPlanError(`${key} must be a non-empty string`);
  }
  return value;
}

function req(args: Record<string, unknown>, key: string): string {
  const value = str(args, key);
  if (!value) throw new ToolPlanError(`${key} is required`);
  return value;
}

function normalizeArgs(raw: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = { ...raw };
  for (const [from, to] of Object.entries(ARG_ALIASES)) {
    if (args[to] == null && args[from] != null) args[to] = args[from];
    delete args[from];
  }
  return args;
}

function resolveRef(process: Process, ref: string, lastId?: string): string {
  if (ref === '$last' || ref === '$id') {
    if (!lastId) throw new ToolPlanError('$last is not set');
    return lastId;
  }
  if (process.nodes.some((n) => n.id === ref) || process.flows.some((f) => f.id === ref)) return ref;
  if ((process.participants ?? []).some((p) => p.id === ref)) return ref;
  if ((process.lanes ?? []).some((l) => l.id === ref)) return ref;
  if ((process.messageFlows ?? []).some((m) => m.id === ref)) return ref;
  for (const region of allRegions(process)) {
    if (region.id === ref || region.split === ref || region.join === ref) return ref;
    if (region.branches.some((b) => b.id === ref)) return ref;
  }
  const named = process.nodes.filter((n) => n.name === ref);
  if (named.length === 1) return named[0].id;
  if (named.length > 1) throw new ToolPlanError(`ambiguous name: ${ref}`);
  const namedParts = (process.participants ?? []).filter((p) => p.name === ref);
  if (namedParts.length === 1) return namedParts[0]!.id;
  const namedLanes = (process.lanes ?? []).filter((l) => l.name === ref);
  if (namedLanes.length === 1) return namedLanes[0]!.id;
  const branches = allRegions(process).flatMap((r) => r.branches.filter((b) => b.name === ref));
  if (branches.length === 1) return branches[0].id;
  if (branches.length > 1) throw new ToolPlanError(`ambiguous branch name: ${ref}`);
  throw new ToolPlanError(`unknown element: ${ref}`);
}

function ref(process: Process, args: Record<string, unknown>, key: string, lastId?: string): string | undefined {
  const value = str(args, key);
  return value ? resolveRef(process, value, lastId) : undefined;
}

function reqRef(process: Process, args: Record<string, unknown>, key: string, lastId?: string): string {
  return resolveRef(process, req(args, key), lastId);
}

function branchesArg(args: Record<string, unknown>): Array<{ name: string; id?: string }> | undefined {
  const raw = args.branches;
  if (raw == null) return undefined;
  if (!Array.isArray(raw) || raw.length < 2) throw new ToolPlanError('branches must be an array of 2+ { name }');
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object') throw new ToolPlanError(`branches[${i}] must be an object`);
    const name = (item as { name?: unknown }).name;
    const id = (item as { id?: unknown }).id;
    if (typeof name !== 'string' || !name.trim()) throw new ToolPlanError(`branches[${i}].name is required`);
    return { name, ...(typeof id === 'string' ? { id } : {}) };
  });
}

function componentDef(componentId: string) {
  const def = bpmnComponentRegistry.get(componentId);
  if (!def) throw new ToolPlanError(`unknown component: ${componentId}`);
  return def;
}

function taskPlace(process: Process, args: Record<string, unknown>, lastId?: string): PlaceSpec {
  const componentId = str(args, 'componentId');
  const after = ref(process, args, 'after', lastId);
  const before = ref(process, args, 'before', lastId);
  const branchId = ref(process, args, 'branchId', lastId);
  const type = str(args, 'type') as FlowNodeType | undefined;
  if (type === 'exclusiveGateway' || type === 'parallelGateway' || type === 'inclusiveGateway' || type === 'eventBasedGateway') {
    throw new ToolPlanError('gateways must be created with splitExclusive / splitParallel / splitInclusive / splitEventBased');
  }
  if (componentId) {
    const def = componentDef(componentId);
    const split = GATEWAY_TOOLS[def.id];
    if (split) throw new ToolPlanError(`${def.id} must be created with ${split}`);
    if (!TASK_BPMN.has(def.bpmnType)) {
      throw new ToolPlanError(`no semantic create op for ${def.id}`);
    }
    return {
      name: str(args, 'name') ?? def.title,
      bpmnType: def.bpmnType,
      type: 'task',
      after,
      before,
      branchId,
      componentId: def.id,
    };
  }
  return { name: str(args, 'name'), after, before, branchId, type, bpmnType: str(args, 'bpmnType') };
}

function addTask(process: Process, args: Record<string, unknown>, lastId?: string): ToolResult {
  const spec = taskPlace(process, args, lastId);
  if (spec.componentId && !spec.after && !spec.before && !spec.branchId) {
    return wrap('addTask', createFromComponent(process, spec.componentId, { name: spec.name }));
  }
  return wrap('addTask', coreAddTask(process, spec));
}

function addAfter(process: Process, args: Record<string, unknown>, lastId?: string): ToolResult {
  const after = reqRef(process, args, 'after', lastId);
  return wrap('addAfter', coreAddAfter(process, after, taskPlace(process, args, lastId)));
}

function addBefore(process: Process, args: Record<string, unknown>, lastId?: string): ToolResult {
  const before = reqRef(process, args, 'before', lastId);
  return wrap('addBefore', coreAddBefore(process, before, taskPlace(process, args, lastId)));
}

function splitArgs(process: Process, args: Record<string, unknown>, lastId?: string) {
  return {
    after: reqRef(process, args, 'after', lastId),
    name: str(args, 'name'),
    branches: branchesArg(args),
  };
}

const HANDLERS: Record<ToolName, (process: Process, args: Record<string, unknown>, lastId?: string) => ToolResult> = {
  inspectProcess: (process) => unchanged(process, 'inspectProcess', processView(process)),
  inspectRegion: (process, args, lastId) =>
    unchanged(process, 'inspectRegion', inspectRegionView(process, reqRef(process, args, 'regionId', lastId))),
  inspectBranch: (process, args, lastId) =>
    unchanged(process, 'inspectBranch', inspectBranchView(process, reqRef(process, args, 'branchId', lastId))),
  addTask,
  addAfter,
  addBefore,
  splitExclusive: (process, args, lastId) => wrap('splitExclusive', coreSplitExclusive(process, splitArgs(process, args, lastId))),
  splitParallel: (process, args, lastId) => wrap('splitParallel', coreSplitParallel(process, splitArgs(process, args, lastId))),
  splitInclusive: (process, args, lastId) => wrap('splitInclusive', coreSplitInclusive(process, splitArgs(process, args, lastId))),
  splitEventBased: (process, args, lastId) => wrap('splitEventBased', coreSplitEventBased(process, splitArgs(process, args, lastId))),
  attachBoundaryTimer: (process, args, lastId) => {
    const on = ref(process, args, 'on', lastId) ?? ref(process, args, 'after', lastId);
    if (!on) throw new ToolPlanError('on is required');
    return wrap('attachBoundaryTimer', coreAttachBoundaryTimer(process, { on, name: str(args, 'name') }));
  },
  addPool: (process, args) => wrap('addPool', coreAddPool(process, { name: str(args, 'name') })),
  addLane: (process, args, lastId) =>
    wrap(
      'addLane',
      coreAddLane(process, {
        name: str(args, 'name'),
        participantId: ref(process, args, 'participantId', lastId),
        parentLaneId: ref(process, args, 'parentLaneId', lastId),
      }),
    ),
  addMessageInteraction: (process, args, lastId) =>
    wrap(
      'addMessageInteraction',
      coreAddMessageInteraction(process, {
        from: reqRef(process, args, 'from', lastId),
        to: reqRef(process, args, 'to', lastId),
        name: str(args, 'name'),
      }),
    ),
  addBranch: (process, args, lastId) =>
    wrap('addBranch', coreAddBranch(process, reqRef(process, args, 'regionId', lastId), { name: str(args, 'name'), id: str(args, 'id') })),
  moveToBranch: (process, args, lastId) =>
    wrap(
      'moveToBranch',
      coreMoveToBranch(process, reqRef(process, args, 'nodeId', lastId), reqRef(process, args, 'branchId', lastId), {
        after: ref(process, args, 'after', lastId),
      }),
    ),
  renameElement: (process, args, lastId) =>
    wrap('renameElement', coreRenameElement(process, reqRef(process, args, 'id', lastId), req(args, 'name'))),
  removeElement: (process, args, lastId) =>
    wrap('removeElement', coreRemoveElement(process, reqRef(process, args, 'id', lastId))),
  lint: (process) => unchanged(process, 'lint', lintProcess(process)),
};

export function parseToolPlan(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) {
    throw new ToolPlanError('tools must be an array of { name, args }');
  }
  return value.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ToolPlanError(`tools[${i}] must be an object`);
    }
    const row = item as { name?: unknown; args?: unknown };
    if (typeof row.name !== 'string' || !TOOL_NAME_SET.has(row.name)) {
      throw new ToolPlanError(`unknown tool: ${String(row.name)}`);
    }
    const args = row.args == null ? {} : row.args;
    if (typeof args !== 'object' || Array.isArray(args)) {
      throw new ToolPlanError(`${row.name} args must be an object`);
    }
    const record = args as Record<string, unknown>;
    assertNoGeometry(record, row.name);
    return { name: row.name as ToolName, args: record };
  });
}

export function executeTool(process: Process, call: ToolCall, lastId?: string, options?: PlanOptions): ToolResult {
  assertNoGeometry(call.args, call.name);
  const args = applyScopeDefaults(call.name, normalizeArgs(call.args), options?.scope);
  try {
    if (!isReadOnlyTool(call.name)) {
      assertMutationAllowed(
        process,
        call.name,
        args,
        lastId,
        (ref) => resolveRef(process, ref, lastId),
        options?.scope,
      );
    }
    const result = HANDLERS[call.name](process, args, lastId);
    if (!isReadOnlyTool(call.name)) {
      assertLocksIntact(process, result.process, call.name);
      assertOutsideScopeIntact(process, result.process, call.name, options?.scope);
    }
    return result;
  } catch (error) {
    if (error instanceof ToolPlanError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ToolPlanError(`${call.name}: ${message}`);
  }
}

export function executePlan(process: Process, calls: ToolCall[], options?: PlanOptions): PlanResult {
  if (!calls.length) {
    return { process, inverse: () => process, id: process.id, steps: [] };
  }
  let current = process;
  let lastId: string | undefined;
  const steps: ToolResult[] = [];
  const inverses: Array<(p: Process) => Process> = [];
  for (const call of calls) {
    const step = executeTool(current, call, lastId, options);
    steps.push(step);
    inverses.push(step.inverse);
    current = step.process;
    lastId = step.id;
  }
  return {
    process: current,
    id: lastId ?? process.id,
    steps,
    inverse: (p) => {
      let cur = p;
      for (let i = inverses.length - 1; i >= 0; i--) cur = inverses[i](cur);
      return cur;
    },
  };
}

export function toolSystemPrompt(input?: { process?: Process; scope?: PlanOptions['scope'] }): string {
  const components = bpmnComponentRegistry
    .list()
    .filter((d) => TASK_BPMN.has(d.bpmnType) || d.id in GATEWAY_TOOLS)
    .map((d) => `${d.id} — ${d.title}`)
    .join('; ');
  return `You are a BPMN 2.0 semantic process assistant.
Edit process structure only. Layout / BPMN DI is compiled later. Never invent XML or coordinates.

Return ONLY JSON:
{ "message": string, "tools": [ { "name": string, "args": object } ] }

Allowed tools:
- inspectProcess {}
- inspectRegion { regionId }
- inspectBranch { branchId }
- addTask { name?, after?, before?, branchId?, componentId? }
- addAfter { after, name?, componentId? }
- addBefore { before, name?, componentId? }
- splitExclusive { after, name?, branches?: [{ name }] }  // XOR; join is created with the split
- splitParallel { after, name?, branches?: [{ name }] }   // AND; join is created with the split
- splitInclusive { after, name?, branches?: [{ name }] }  // OR; join is created with the split
- splitEventBased { after, name?, branches?: [{ name }] } // event-based wait; XOR join; region is marked eventBased
- attachBoundaryTimer { on, name? }                      // timer on a task; exception/feedback path in IR
- addPool { name? }                                      // wrap this process and add a partner pool
- addLane { participantId?, parentLaneId?, name? }
- addMessageInteraction { from, to, name? }              // message flow between participants
- addBranch { regionId, name? }
- moveToBranch { nodeId, branchId, after? }
- renameElement { id, name }
- removeElement { id }
- lint {}

Registry componentId values: ${components}

Rules:
- tools[].name must be one of the names above. Never emit bpmnXml, workflowJson, waypoints, x, y, width, height, or bounds.
- Prefer ids from the process view. $last is the id returned by the previous tool (node, region, or branch).
- Node names resolve when unique. XOR branches are named Yes/No by default.
- Decisions: splitExclusive, splitParallel, splitInclusive, or splitEventBased — never a lone gateway node.
- Timeout while a task is active: attachBoundaryTimer, not an event-based gateway.
- Do not call inspect* unless the process view is missing an id you need.
- lint reports @bpmn/rules findings. Do not invent quality scores.${
    scopePromptLines(input?.process, input?.scope)
      .map((line) => `\n- ${line}`)
      .join('')
  }`;
}
