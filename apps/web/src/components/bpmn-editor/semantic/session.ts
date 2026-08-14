import {
  executePlan,
  isSemanticProcess,
  parseToolPlan,
  type AgentScope,
  type ToolCall,
} from '@bpmn/agent-tools';
import {
  allRegions,
  assignLane as coreAssignLane,
  bpmnComponentRegistry,
  createFromComponent,
  extractSubgraph,
  moveAfter,
  moveToBranch,
  pasteSubgraph,
  removeElement,
  renameElement,
  replaceComponent,
  setBranchLocked as lockBranch,
  setCalledElement,
  setDocumentation,
  setFlowKind,
  setIsExecutable,
  setMultiInstance,
  setPreserveAttr,
  setTimerDuration,
  type Applied,
  type Process,
  type SemanticClip,
} from '@bpmn/semantic-core';
import { exportProcessXml, xmlToProcess } from '@bpmn/bpmn-adapter';
import type { BpmnComponentDefinition } from '@bpmn/semantic-core';
import type { FlowKind } from '../inspector/inspectorModel';
import type { InsertTarget } from '../palette/insertTarget';
import { hasNewNodes, participantSetKey, shouldFitCanvas } from '../fitCanvas';
import { dropSlot } from './dropSlot';

/** Modeler instance is keyed by processId only. Autosave xml is an output. */
export const MODELER_REMOUNT_KEYS = ['processId'] as const;

const UNDO_LIMIT = 50;

/** Create after a selected lane assigns the new flow node; Add lane on a lane is a sibling. */
export function createIntoLane(
  process: Process,
  catalogId: string,
  afterId?: string,
): { after?: string; laneId?: string } {
  if (!afterId) return {};
  const def = bpmnComponentRegistry.get(catalogId);
  const afterIsLane = (process.lanes ?? []).some((lane) => lane.id === afterId);
  const placement = def?.layoutBehavior.placement;
  if (afterIsLane && placement === 'attachToActivityBoundary') return {};
  const intoLane =
    afterIsLane &&
    !!def &&
    (placement === 'flowNode' || placement === 'container') &&
    def.canCreate({ parentBpmnType: 'bpmn:Lane' });
  return intoLane ? { laneId: afterId } : { after: afterId };
}

/** Nodes `assignLane` should cover when create returns a node or a split region. */
export function createdLaneTargets(process: Process, appliedId: string): string[] {
  const node = process.nodes.find((item) => item.id === appliedId);
  if (node) return node.type === 'boundaryEvent' ? [] : [appliedId];
  const region = allRegions(process).find((item) => item.id === appliedId);
  if (!region) return [];
  const ids = [region.split, region.join, ...region.branches.flatMap((branch) => branch.nodeIds)];
  return [...new Set(ids)].filter((id) => process.nodes.some((item) => item.id === id && item.type !== 'boundaryEvent'));
}

function assignCreatedToLane(process: Process, appliedId: string, laneId: string): Process {
  let current = process;
  for (const id of createdLaneTargets(current, appliedId)) {
    current = coreAssignLane(current, id, laneId).process;
  }
  return current;
}

export function diagramImportError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error || '');
  const next = new Error(
    /root-0|Cannot read properties of undefined/i.test(raw)
      ? 'Could not apply the generated diagram. The last good process is still open.'
      : raw.trim() || 'Could not apply the generated diagram. The last good process is still open.',
  );
  next.name = 'DiagramImportError';
  if (error instanceof Error) next.cause = error;
  return next;
}

/** `reveal` = this import added flow nodes, so an off-screen result must be brought into view. */
export type ImportXmlOptions = { fit?: boolean; reveal?: boolean };

export type DiagramWriter = {
  importXml: (xml: string, selectId?: string | string[], options?: ImportXmlOptions) => Promise<void>;
  updateLabel?: (id: string, name: string) => void;
};

export type SemanticEditor = {
  process: () => Process;
  xml: () => string;
  bootstrap: () => Promise<string>;
  create: (catalogId: string, afterId?: string, target?: InsertTarget) => Promise<{ id: string; xml: string }>;
  applyPlan: (tools: ToolCall[], scope?: AgentScope) => Promise<string>;
  applyProcess: (next: Process, selectId?: string) => Promise<string>;
  rename: (id: string, name: string) => string;
  replace: (id: string, def: BpmnComponentDefinition) => Promise<string>;
  remove: (id: string) => Promise<string>;
  setFlowKind: (flowId: string, kind: FlowKind, condition?: string) => Promise<string>;
  setCondition: (flowId: string, body: string) => Promise<string>;
  setCalledElement: (id: string, calledElement: string) => Promise<string>;
  setDocumentation: (id: string, text: string) => Promise<string>;
  setTimerDuration: (id: string, duration: string) => Promise<string>;
  setIsExecutable: (executable: boolean, id?: string) => Promise<string>;
  setPreserveAttr: (id: string, key: string, value: string) => Promise<string>;
  setMultiInstance: (id: string, spec: { sequential?: boolean; cardinality?: string }) => Promise<string>;
  setBranchLocked: (branchId: string, locked: boolean) => string;
  adoptXml: (xml: string) => Promise<string>;
  drop: (nodeId: string, point: { x: number; y: number }) => Promise<string>;
  assignLane: (nodeId: string, laneId: string) => Promise<string>;
  copy: (ids: string[]) => SemanticClip | null;
  paste: (afterId?: string) => Promise<string | null>;
  undo: () => Promise<string>;
  redo: () => Promise<string>;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export async function createSemanticEditor(writer: DiagramWriter, initialXml: string): Promise<SemanticEditor> {
  let process = await xmlToProcess(initialXml);
  let clipboard: SemanticClip | null = null;
  let displayedSet: string | undefined;
  const undoStack: Process[] = [];
  const redoStack: Process[] = [];

  function xml(): string {
    return exportProcessXml(process);
  }

  function recordUndo(previous: Process): void {
    undoStack.push(previous);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function revertUndo(previous: Process): void {
    if (undoStack[undoStack.length - 1] === previous) undoStack.pop();
  }

  async function commit(selectId?: string | string[], previous?: Process): Promise<string> {
    const next = xml();
    const nextSet = participantSetKey(process);
    const fit = shouldFitCanvas(displayedSet, nextSet);
    const reveal = hasNewNodes(previous, process);
    try {
      await writer.importXml(next, selectId, { fit, reveal });
      displayedSet = nextSet;
      return next;
    } catch (error) {
      if (previous) {
        process = previous;
        revertUndo(previous);
      }
      throw diagramImportError(error);
    }
  }

  function applyOp(applied: Applied): void {
    recordUndo(process);
    process = applied.process;
  }

  return {
    process: () => process,
    xml,
    async bootstrap() {
      return commit();
    },
    async create(catalogId, afterId, target) {
      const previous = process;
      const place = createIntoLane(process, catalogId, afterId);
      const applied = createFromComponent(process, catalogId, {
        ...(place.after ? { after: place.after } : {}),
        ...(target?.branchId ? { branchId: target.branchId } : {}),
        ...(target?.onFlow ? { onFlow: target.onFlow } : {}),
      });
      const next = place.laneId
        ? assignCreatedToLane(applied.process, applied.id, place.laneId)
        : applied.process;
      applyOp({ process: next, inverse: () => structuredClone(previous), id: applied.id });
      const stayOnPool =
        catalogId === 'participant.lane' &&
        !!afterId &&
        (previous.participants ?? []).some((participant) => participant.id === afterId);
      const committed = await commit(stayOnPool ? afterId : applied.id, previous);
      return { id: applied.id, xml: committed };
    },
    async applyPlan(tools, scope) {
      const calls = parseToolPlan(tools);
      if (!calls.length) return xml();
      const previous = process;
      const plan = executePlan(process, calls, { scope });
      if (plan.process === process) return xml();
      applyOp(plan);
      return commit(plan.id, previous);
    },
    async applyProcess(next, selectId) {
      if (!isSemanticProcess(next)) throw new Error('not a semantic process graph');
      const previous = process;
      recordUndo(previous);
      process = structuredClone(next);
      return commit(selectId, previous);
    },
    rename(id, name) {
      applyOp(renameElement(process, id, name));
      writer.updateLabel?.(id, name);
      return xml();
    },
    async replace(id, def) {
      const previous = process;
      applyOp(replaceComponent(process, id, def.id));
      return commit(id, previous);
    },
    async remove(id) {
      const previous = process;
      applyOp(removeElement(process, id));
      return commit(undefined, previous);
    },
    async setFlowKind(flowId, kind, condition) {
      const previous = process;
      applyOp(setFlowKind(process, flowId, kind, condition));
      return commit(flowId, previous);
    },
    async setCondition(flowId, body) {
      const previous = process;
      applyOp(setFlowKind(process, flowId, 'conditional', body));
      return commit(flowId, previous);
    },
    async setCalledElement(id, calledElement) {
      const previous = process;
      applyOp(setCalledElement(process, id, calledElement));
      return commit(id, previous);
    },
    async setDocumentation(id, text) {
      const previous = process;
      applyOp(setDocumentation(process, id, text));
      return commit(id, previous);
    },
    async setTimerDuration(id, duration) {
      const previous = process;
      applyOp(setTimerDuration(process, id, duration));
      return commit(id, previous);
    },
    async setIsExecutable(executable, id) {
      const previous = process;
      applyOp(setIsExecutable(process, executable, id));
      return commit(id ?? process.id, previous);
    },
    async setPreserveAttr(id, key, value) {
      const previous = process;
      applyOp(setPreserveAttr(process, id, key, value));
      return commit(id, previous);
    },
    async setMultiInstance(id, spec) {
      const previous = process;
      applyOp(setMultiInstance(process, id, spec));
      return commit(id, previous);
    },
    setBranchLocked(branchId, locked) {
      applyOp(lockBranch(process, branchId, locked));
      return xml();
    },
    async adoptXml(raw) {
      const previous = process;
      const next = await xmlToProcess(raw);
      recordUndo(previous);
      process = next;
      return commit(undefined, previous);
    },
    async drop(nodeId, point) {
      const previous = process;
      const slot = dropSlot(process, nodeId, point);
      if (!slot) return commit(nodeId, previous);
      try {
        let next = process;
        if (slot.branchId && slot.afterId) {
          next = moveToBranch(next, nodeId, slot.branchId, { after: slot.afterId }).process;
        } else if (slot.afterId) {
          next = moveAfter(next, nodeId, slot.afterId).process;
        }
        if (slot.laneId) next = coreAssignLane(next, nodeId, slot.laneId).process;
        applyOp({ process: next, inverse: () => structuredClone(previous), id: nodeId });
      } catch {
        return commit(nodeId, previous);
      }
      return commit(nodeId, previous);
    },
    async assignLane(nodeId, laneId) {
      const previous = process;
      applyOp(coreAssignLane(process, nodeId, laneId));
      return commit(nodeId, previous);
    },
    copy(ids) {
      clipboard = extractSubgraph(process, ids);
      return clipboard;
    },
    async paste(afterId) {
      if (!clipboard) return null;
      const previous = process;
      const applied = pasteSubgraph(process, clipboard, afterId);
      if (!applied.pastedIds.length) return null;
      applyOp(applied);
      return commit(applied.pastedIds, previous);
    },
    async undo() {
      const prev = undoStack.pop();
      if (!prev) return xml();
      redoStack.push(process);
      process = prev;
      return commit();
    },
    async redo() {
      const next = redoStack.pop();
      if (!next) return xml();
      undoStack.push(process);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      process = next;
      return commit();
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
