import { branchTargetsAfter, type Process } from '@bpmn/semantic-core';
import { isBpmnType, type DiagramElement } from '../diagramElement';

/** Where a contextual create lands. Semantics only — branch or flow, never coordinates. */
export type InsertTarget = { branchId?: string; onFlow?: string };

export type BranchChoice = InsertTarget & { label: string };

export function isSequenceFlowElement(element: DiagramElement | null): boolean {
  return !!element && isBpmnType(element, 'bpmn:SequenceFlow');
}

/**
 * `+` on a sequence flow inserts on that flow; `+` on a node with one continuation
 * inserts after it; `+` on a split must name the branch first.
 */
export function continueTarget(
  element: DiagramElement | null,
  process?: Process,
): { target?: InsertTarget; choices: BranchChoice[] } {
  if (!element) return { choices: [] };
  if (isSequenceFlowElement(element)) return { target: { onFlow: element.id }, choices: [] };
  if (!process?.nodes.some((node) => node.id === element.id)) return { choices: [] };
  const targets = branchTargetsAfter(process, element.id);
  if (targets.length < 2) return { choices: [] };
  return {
    choices: targets.map(({ label, branchId, flowId }) => ({
      label,
      ...(branchId ? { branchId } : { onFlow: flowId }),
    })),
  };
}

/**
 * Catalog create has no branch picker. If the selection splits, refuse until
 * Continue with (or a selected flow) names the continuation.
 */
export function resolveInsert(
  element: DiagramElement | null,
  process: Process | undefined,
  picked?: InsertTarget,
): { target?: InsertTarget; choices: BranchChoice[]; blocked: boolean } {
  const at = continueTarget(element, process);
  const target = picked ?? at.target;
  if (!target && at.choices.length > 1) return { choices: at.choices, blocked: true };
  return { ...(target ? { target } : {}), choices: at.choices, blocked: false };
}
