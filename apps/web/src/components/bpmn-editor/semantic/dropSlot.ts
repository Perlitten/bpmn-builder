import { layoutProcess, TOKENS, type Bounds } from '@bpmn/layout-engine';
import { allRegions, getNode, happyPathIds, type Process, type StructuredRegion } from '@bpmn/semantic-core';

export type DropSlot = {
  afterId: string;
  branchId?: string;
};

function cy(box: Bounds): number {
  return box.y + box.height / 2;
}

function right(box: Bounds): number {
  return box.x + box.width;
}

/**
 * Map a drop point (diagram space) onto a semantic slot.
 * Coordinates are compared to canonical layout of the current graph, not the dragged XY.
 */
export function dropSlot(process: Process, draggedId: string, point: { x: number; y: number }): DropSlot | null {
  const dragged = process.nodes.find((node) => node.id === draggedId);
  if (!dragged || dragged.type !== 'task') return null;
  const layout = layoutProcess(process);
  if (!layout.shapes[draggedId]) return null;

  for (const region of allRegions(process)) {
    const split = layout.shapes[region.split];
    const join = layout.shapes[region.join];
    if (!split || !join) continue;
    if (point.x < right(split) || point.x > join.x) continue;
    const branch = pickBranch(region, layout, point.y, draggedId);
    if (!branch) continue;
    const afterId = lastNodeLeftOf(branch.nodeIds, layout, point.x, draggedId) ?? region.split;
    if (afterId === draggedId) continue;
    return { afterId, branchId: branch.id };
  }

  const chain = happyPathIds(process).filter((id) => {
    if (id === draggedId) return false;
    return getNode(process, id).type !== 'end';
  });
  let afterId: string | null = null;
  let best = -Infinity;
  for (const id of chain) {
    const box = layout.shapes[id];
    if (!box) continue;
    const edge = right(box);
    if (edge <= point.x && edge >= best) {
      best = edge;
      afterId = id;
    }
  }
  return afterId && afterId !== draggedId ? { afterId } : null;
}

function pickBranch(
  region: StructuredRegion,
  layout: ReturnType<typeof layoutProcess>,
  y: number,
  draggedId: string,
) {
  const split = layout.shapes[region.split];
  if (!split) return undefined;
  const splitCy = cy(split);
  const n = region.branches.length;
  const span = TOKENS.task.height + TOKENS.branchGap;
  let best = region.branches[0];
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const branch = region.branches[i]!;
    const boxes = branch.nodeIds
      .filter((id) => id !== draggedId)
      .map((id) => layout.shapes[id])
      .filter((box): box is Bounds => !!box);
    const bandCy = boxes.length
      ? boxes.reduce((sum, box) => sum + cy(box), 0) / boxes.length
      : splitCy + (i - (n - 1) / 2) * span;
    const dist = Math.abs(y - bandCy);
    if (dist < bestDist) {
      bestDist = dist;
      best = branch;
    }
  }
  return best;
}

function lastNodeLeftOf(
  nodeIds: string[],
  layout: ReturnType<typeof layoutProcess>,
  x: number,
  draggedId: string,
): string | undefined {
  let afterId: string | undefined;
  let best = -Infinity;
  for (const id of nodeIds) {
    if (id === draggedId) continue;
    const box = layout.shapes[id];
    if (!box) continue;
    const edge = right(box);
    if (edge <= x && edge >= best) {
      best = edge;
      afterId = id;
    }
  }
  return afterId;
}
