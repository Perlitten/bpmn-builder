import { lintProcess, normalizeTaskName } from '../../rules/src/index.js';
import {
  BPMN,
  addAfter as coreAddAfter,
  addBefore as coreAddBefore,
  addBranch as coreAddBranch,
  addTask as coreAddTask,
  addLane as coreAddLane,
  addMessageInteraction as coreAddMessageInteraction,
  addPool as coreAddPool,
  assignLane as coreAssignLane,
  allRegions,
  bpmnComponentRegistry,
  findBranch,
  moveToBranch as coreMoveToBranch,
  removeElement as coreRemoveElement,
  renameElement as coreRenameElement,
  splitExclusive as coreSplitExclusive,
  splitInclusive as coreSplitInclusive,
  splitEventBased as coreSplitEventBased,
  splitParallel as coreSplitParallel,
  attachBoundaryError as coreAttachBoundaryError,
  attachBoundaryTimer as coreAttachBoundaryTimer,
  connectSequenceFlow as coreConnectSequenceFlow,
  createEventSubprocess as coreCreateEventSubprocess,
  createFromComponent,
  addAssociation as coreAddAssociation,
  addDataObject as coreAddDataObject,
  addDataStore as coreAddDataStore,
  addGroup as coreAddGroup,
  addTextAnnotation as coreAddTextAnnotation,
  resolveAssociationEnds,
  setCalledElement as coreSetCalledElement,
  setFlowKind as coreSetFlowKind,
  splitComplex as coreSplitComplex,
  type FlowNodeType,
  type PlaceSpec,
  type SemanticProcess,
} from '../../semantic-core/src/index.js';
import { ToolPlanError, userFacingPlanError } from './errors.js';
import { assertNoGeometry } from './geometry.js';
import { inspectBranchView, inspectRegionView, processView } from './inspect.js';
import {
  applyScopeDefaults,
  assertLocksIntact,
  assertMutationAllowed,
  assertOutsideScopeIntact,
  isReadOnlyTool,
} from './scope.js';
import type { BestEffortPlanResult, PlanFailure, PlanOptions, PlanResult, ToolCall, ToolName, ToolResult } from './types.js';
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

const GATEWAY_TOOLS: Record<string, 'splitExclusive' | 'splitParallel' | 'splitInclusive' | 'splitEventBased' | 'splitComplex'> = {
  'gateway.exclusive': 'splitExclusive',
  'gateway.parallel': 'splitParallel',
  'gateway.inclusive': 'splitInclusive',
  'gateway.eventBased': 'splitEventBased',
  'gateway.complex': 'splitComplex',
};

const ARG_ALIASES: Record<string, string> = {
  afterId: 'after',
  beforeId: 'before',
  elementId: 'id',
  branch: 'branchId',
  host: 'on',
  sourceId: 'from',
  targetId: 'to',
};

function unchanged(process: SemanticProcess, name: ToolName, view: unknown): ToolResult {
  return { name, process, inverse: () => process, id: process.id, view };
}

function wrap(name: ToolName, applied: { process: SemanticProcess; inverse: (current: SemanticProcess) => SemanticProcess; id: string }): ToolResult {
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

function resolveRef(process: SemanticProcess, ref: string, lastId?: string): string {
  if (ref === '$last' || ref === '$id') {
    if (!lastId) throw new ToolPlanError('$last is not set');
    return lastId;
  }
  if (process.nodes.some((n) => n.id === ref) || process.flows.some((f) => f.id === ref)) return ref;
  if ((process.participants ?? []).some((p) => p.id === ref)) return ref;
  if ((process.lanes ?? []).some((l) => l.id === ref)) return ref;
  if ((process.messageFlows ?? []).some((m) => m.id === ref)) return ref;
  if ((process.artifacts ?? []).some((item) => typeof item.id === 'string' && item.id === ref)) return ref;
  const namedArts = (process.artifacts ?? []).filter((item) => {
    const label = typeof item.name === 'string' ? item.name : typeof item.text === 'string' ? item.text : undefined;
    return label === ref;
  });
  if (namedArts.length === 1 && typeof namedArts[0]!.id === 'string') return namedArts[0]!.id;
  if (namedArts.length > 1) throw new ToolPlanError(`ambiguous name: ${ref}`);
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

function ref(process: SemanticProcess, args: Record<string, unknown>, key: string, lastId?: string): string | undefined {
  const value = str(args, key);
  return value ? resolveRef(process, value, lastId) : undefined;
}

function reqRef(process: SemanticProcess, args: Record<string, unknown>, key: string, lastId?: string): string {
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

function taskPlace(process: SemanticProcess, args: Record<string, unknown>, lastId?: string): PlaceSpec {
  const componentId = str(args, 'componentId');
  const after = ref(process, args, 'after', lastId);
  const before = ref(process, args, 'before', lastId);
  const branchId = ref(process, args, 'branchId', lastId);
  const type = str(args, 'type') as FlowNodeType | undefined;
  if (
    type === 'exclusiveGateway' ||
    type === 'parallelGateway' ||
    type === 'inclusiveGateway' ||
    type === 'eventBasedGateway' ||
    type === 'complexGateway'
  ) {
    throw new ToolPlanError(
      'gateways must be created with splitExclusive / splitParallel / splitInclusive / splitEventBased / splitComplex',
    );
  }
  const rawName = str(args, 'name');
  const name = rawName ? normalizeTaskName(rawName) : undefined;
  if (componentId) {
    const def = componentDef(componentId);
    const split = GATEWAY_TOOLS[def.id];
    if (split) throw new ToolPlanError(`${def.id} must be created with ${split}`);
    if (!TASK_BPMN.has(def.bpmnType)) {
      throw new ToolPlanError(`no semantic create op for ${def.id}`);
    }
    return {
      name: name ?? def.title,
      bpmnType: def.bpmnType,
      type: 'task',
      after,
      before,
      branchId,
      componentId: def.id,
    };
  }
  return { name, after, before, branchId, type, bpmnType: str(args, 'bpmnType') };
}

function addTask(process: SemanticProcess, args: Record<string, unknown>, lastId?: string): ToolResult {
  const spec = taskPlace(process, args, lastId);
  if (spec.componentId && !spec.after && !spec.before && !spec.branchId) {
    return wrap('addTask', createFromComponent(process, spec.componentId, { name: spec.name }));
  }
  return wrap('addTask', coreAddTask(process, spec));
}

function addAfter(process: SemanticProcess, args: Record<string, unknown>, lastId?: string): ToolResult {
  const after = reqRef(process, args, 'after', lastId);
  return wrap('addAfter', coreAddAfter(process, after, taskPlace(process, args, lastId)));
}

function addBefore(process: SemanticProcess, args: Record<string, unknown>, lastId?: string): ToolResult {
  const before = reqRef(process, args, 'before', lastId);
  return wrap('addBefore', coreAddBefore(process, before, taskPlace(process, args, lastId)));
}

function splitArgs(process: SemanticProcess, args: Record<string, unknown>, lastId?: string) {
  return {
    after: reqRef(process, args, 'after', lastId),
    name: str(args, 'name'),
    branches: branchesArg(args),
  };
}

const HANDLERS: Record<ToolName, (process: SemanticProcess, args: Record<string, unknown>, lastId?: string) => ToolResult> = {
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
  attachBoundaryError: (process, args, lastId) => {
    const on = ref(process, args, 'on', lastId) ?? ref(process, args, 'after', lastId);
    if (!on) throw new ToolPlanError('on is required');
    return wrap('attachBoundaryError', coreAttachBoundaryError(process, { on, name: str(args, 'name') }));
  },
  createComponent: (process, args, lastId) => {
    const componentId = req(args, 'componentId');
    const def = componentDef(componentId);
    if (!def.implemented) throw new ToolPlanError(`no semantic create op for ${def.id}`);
    let after = ref(process, args, 'after', lastId);
    const branchId = ref(process, args, 'branchId', lastId);
    if (!after && branchId) {
      const { region, branch } = findBranch(process, branchId);
      after = branch.nodeIds.at(-1) ?? region.split;
    }
    return wrap(
      'createComponent',
      createFromComponent(process, componentId, {
        name: str(args, 'name'),
        after,
        from: ref(process, args, 'from', lastId),
        to: ref(process, args, 'to', lastId),
        participantId: ref(process, args, 'participantId', lastId),
        calledElement: str(args, 'calledElement'),
        condition: str(args, 'condition'),
      }),
    );
  },
  createEventSubprocess: (process, args, lastId) =>
    wrap(
      'createEventSubprocess',
      coreCreateEventSubprocess(process, {
        parent: ref(process, args, 'parent', lastId) ?? ref(process, args, 'after', lastId),
        name: str(args, 'name'),
      }),
    ),
  splitComplex: (process, args, lastId) => wrap('splitComplex', coreSplitComplex(process, splitArgs(process, args, lastId))),
  setFlowKind: (process, args, lastId) => {
    const flowId = ref(process, args, 'flowId', lastId) ?? ref(process, args, 'id', lastId) ?? ref(process, args, 'after', lastId);
    if (!flowId) throw new ToolPlanError('flowId is required');
    const kind = req(args, 'kind');
    if (kind !== 'sequence' && kind !== 'conditional' && kind !== 'default') {
      throw new ToolPlanError('kind must be sequence, conditional, or default');
    }
    const resolved = process.flows.some((f) => f.id === flowId)
      ? flowId
      : process.flows.find((f) => f.source === flowId && process.flows.filter((x) => x.source === flowId).length === 1)?.id;
    if (!resolved) throw new ToolPlanError('Select a sequence flow or a source with one outgoing flow');
    return wrap('setFlowKind', coreSetFlowKind(process, resolved, kind, str(args, 'condition')));
  },
  connectSequenceFlow: (process, args, lastId) => {
    const from = reqRef(process, args, 'from', lastId);
    const to = reqRef(process, args, 'to', lastId);
    const kind = str(args, 'kind') ?? 'sequence';
    if (kind !== 'sequence' && kind !== 'conditional' && kind !== 'default') {
      throw new ToolPlanError('kind must be sequence, conditional, or default');
    }
    return wrap(
      'connectSequenceFlow',
      coreConnectSequenceFlow(process, {
        from,
        to,
        name: str(args, 'name'),
        condition: str(args, 'condition'),
        kind,
        id: str(args, 'id'),
      }),
    );
  },
  setCalledElement: (process, args, lastId) =>
    wrap('setCalledElement', coreSetCalledElement(process, reqRef(process, args, 'id', lastId), req(args, 'calledElement'))),
  addDataObject: (process, args) => wrap('addDataObject', coreAddDataObject(process, { name: str(args, 'name') })),
  addDataStore: (process, args) => wrap('addDataStore', coreAddDataStore(process, { name: str(args, 'name') })),
  addTextAnnotation: (process, args, lastId) =>
    wrap(
      'addTextAnnotation',
      coreAddTextAnnotation(process, {
        text: str(args, 'text') ?? str(args, 'name'),
        associateTo: ref(process, args, 'associateTo', lastId) ?? ref(process, args, 'after', lastId),
      }),
    ),
  addGroup: (process, args) => wrap('addGroup', coreAddGroup(process, { name: str(args, 'name') })),
  addAssociation: (process, args, lastId) =>
    wrap(
      'addAssociation',
      coreAddAssociation(
        process,
        resolveAssociationEnds(process, {
          from: ref(process, args, 'from', lastId),
          to: ref(process, args, 'to', lastId),
          after: ref(process, args, 'after', lastId),
        }),
      ),
    ),
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
  assignLane: (process, args, lastId) => {
    const nodeId = reqRef(process, args, 'nodeId', lastId);
    const laneId = reqRef(process, args, 'laneId', lastId);
    const node = process.nodes.find((item) => item.id === nodeId);
    if (node?.type === 'boundaryEvent') {
      throw new ToolPlanError('Boundary events attach to an activity, not a lane.');
    }
    return wrap('assignLane', coreAssignLane(process, nodeId, laneId));
  },
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
  renameElement: (process, args, lastId) => {
    const id = reqRef(process, args, 'id', lastId);
    const rawName = req(args, 'name');
    const node = process.nodes.find((n) => n.id === id);
    const isTaskNode = node && (node.type === 'task' || node.type === 'subProcess');
    const name = isTaskNode ? normalizeTaskName(rawName) : rawName;
    return wrap('renameElement', coreRenameElement(process, id, name));
  },
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

export function executeTool(process: SemanticProcess, call: ToolCall, lastId?: string, options?: PlanOptions): ToolResult {
  assertNoGeometry(call.args, call.name);
  const args = applyScopeDefaults(call.name, normalizeArgs(call.args), options?.scope, {
    process,
    lastId,
  });
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
      const component = call.name === 'createComponent' && typeof args.componentId === 'string'
        ? bpmnComponentRegistry.get(args.componentId)
        : undefined;
      const connectorComponent = component?.layoutBehavior.placement === 'sequenceFlow'
        || component?.layoutBehavior.placement === 'association';
      assertOutsideScopeIntact(process, result.process, call.name, options?.scope, {
        allowDerivedStructureChange: connectorComponent,
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const facing = userFacingPlanError(error instanceof ToolPlanError ? message : `${call.name}: ${message}`);
    if (error instanceof ToolPlanError && facing === message) throw error;
    throw new ToolPlanError(facing);
  }
}

export function executePlan(process: SemanticProcess, calls: ToolCall[], options?: PlanOptions): PlanResult {
  if (!calls.length) {
    return { process, inverse: () => process, id: process.id, steps: [] };
  }
  let current = process;
  let lastId: string | undefined;
  const steps: ToolResult[] = [];
  const inverses: Array<(p: SemanticProcess) => SemanticProcess> = [];
  for (let index = 0; index < calls.length; index++) {
    const call = calls[index]!;
    let step: ToolResult;
    try {
      step = executeTool(current, call, lastId, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ToolPlanError(`Step ${index + 1} (${call.name}) failed: ${message}`);
    }
    steps.push(step);
    inverses.push(step.inverse);
    current = step.process;
    if (!isReadOnlyTool(call.name)) lastId = step.id;
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

/** Execute as much of an Architect plan as possible and report failed steps. */
export function executePlanBestEffort(
  process: SemanticProcess,
  calls: ToolCall[],
  options?: PlanOptions,
): BestEffortPlanResult {
  let current = process;
  let lastId: string | undefined;
  const steps: ToolResult[] = [];
  const stepIndices: number[] = [];
  const failures: PlanFailure[] = [];
  const inverses: Array<(p: SemanticProcess) => SemanticProcess> = [];
  for (let index = 0; index < calls.length; index++) {
    const call = calls[index]!;
    try {
      const step = executeTool(current, call, lastId, options);
      steps.push(step);
      stepIndices.push(index);
      inverses.push(step.inverse);
      current = step.process;
      if (!isReadOnlyTool(call.name)) lastId = step.id;
    } catch (error) {
      if (error instanceof ToolPlanError && error.fatal) throw error;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        index,
        name: call.name,
        message: message.replace(/^Step \d+ \([^)]*\) failed:\s*/i, ''),
      });
    }
  }
  return {
    process: current,
    id: lastId ?? process.id,
    steps,
    stepIndices,
    failures,
    inverse: (p) => {
      let cur = p;
      for (let i = inverses.length - 1; i >= 0; i--) cur = inverses[i](cur);
      return cur;
    },
  };
}
