import {
  executePlan,
  isSemanticProcess,
  parseToolPlan,
  type AgentScope,
  type ToolCall,
} from '@bpmn/agent-tools';
import {
  createFromComponent,
  extractSubgraph,
  moveAfter,
  moveToBranch,
  pasteSubgraph,
  removeElement,
  renameElement,
  replaceBpmnType,
  setBranchLocked as lockBranch,
  setFlowKind,
  type Applied,
  type Process,
  type SemanticClip,
} from '@bpmn/semantic-core';
import { exportProcessXml, xmlToProcess } from '@bpmn/bpmn-adapter';
import type { BpmnComponentDefinition } from '@bpmn/semantic-core';
import type { FlowKind } from '../inspector/inspectorModel';
import { dropSlot } from './dropSlot';

/** Modeler instance is keyed by processId only. Autosave xml is an output. */
export const MODELER_REMOUNT_KEYS = ['processId'] as const;

const UNDO_LIMIT = 50;

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

export type DiagramWriter = {
  importXml: (xml: string, selectId?: string | string[]) => Promise<void>;
  updateLabel?: (id: string, name: string) => void;
};

export type SemanticEditor = {
  process: () => Process;
  xml: () => string;
  bootstrap: () => Promise<string>;
  create: (catalogId: string, afterId?: string) => Promise<{ id: string; xml: string }>;
  applyPlan: (tools: ToolCall[], scope?: AgentScope) => Promise<string>;
  applyProcess: (next: Process, selectId?: string) => Promise<string>;
  rename: (id: string, name: string) => string;
  replace: (id: string, def: BpmnComponentDefinition) => Promise<string>;
  remove: (id: string) => Promise<string>;
  setFlowKind: (flowId: string, kind: FlowKind, condition?: string) => Promise<string>;
  setCondition: (flowId: string, body: string) => Promise<string>;
  setBranchLocked: (branchId: string, locked: boolean) => string;
  adoptXml: (xml: string) => Promise<string>;
  drop: (nodeId: string, point: { x: number; y: number }) => Promise<string>;
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
    try {
      await writer.importXml(next, selectId);
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
    async create(catalogId, afterId) {
      const previous = process;
      const applied = createFromComponent(process, catalogId, afterId ? { after: afterId } : {});
      applyOp(applied);
      const stayOnPool =
        catalogId === 'participant.lane' &&
        !!afterId &&
        (previous.participants ?? []).some((participant) => participant.id === afterId);
      const next = await commit(stayOnPool ? afterId : applied.id, previous);
      return { id: applied.id, xml: next };
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
      applyOp(replaceBpmnType(process, id, def.bpmnType));
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
        applyOp(
          slot.branchId
            ? moveToBranch(process, nodeId, slot.branchId, { after: slot.afterId })
            : moveAfter(process, nodeId, slot.afterId),
        );
      } catch {
        return commit(nodeId, previous);
      }
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
