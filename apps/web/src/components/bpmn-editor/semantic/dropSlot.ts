import { layoutProcess, TOKENS, type Bounds } from '@bpmn/layout-engine';
import { allRegions, getNode, happyPathIds, type SemanticProcess, type StructuredRegion } from '@bpmn/semantic-core';

export type DropSlot = {
  afterId?: string;
  branchId?: string;
  laneId?: string;
};

function cy(box: Bounds): number {
  return box.y + box.height / 2;
}

function right(box: Bounds): number {
  return box.x + box.width;
}

function contains(box: Bounds, point: { x: number; y: number }): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

function area(box: Bounds): number {
  return box.width * box.height;
}

/**
 * Map a drop point (diagram space) onto a semantic slot.
 * Coordinates are compared to canonical layout of the current graph, not the dragged XY.
 * Lane body → assignLane; drop on a node in a lane → moveAfter/moveToBranch + assignLane.
 */
export function dropSlot(process: SemanticProcess, draggedId: string, point: { x: number; y: number }): DropSlot | null {
  const dragged = process.nodes.find((node) => node.id === draggedId);
  if (!dragged || dragged.type === 'boundaryEvent') return null;
  const layout = layoutProcess(process);
  if (!layout.shapes[draggedId]) return null;

  const reorder = dragged.type === 'task' ? reorderSlot(process, layout, draggedId, point) : null;
  const laneId = laneForDrop(process, layout, draggedId, point);
  if (reorder && laneId) return { ...reorder, laneId };
  if (reorder) return reorder;
  return laneId ? { laneId } : null;
}

function reorderSlot(
  process: SemanticProcess,
  layout: ReturnType<typeof layoutProcess>,
  draggedId: string,
  point: { x: number; y: number },
): DropSlot | null {
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

function laneForDrop(
  process: SemanticProcess,
  layout: ReturnType<typeof layoutProcess>,
  draggedId: string,
  point: { x: number; y: number },
): string | undefined {
  const lanes = process.lanes ?? [];
  if (!lanes.length) return undefined;
  const hitNode = smallestIdAt(process.nodes, layout, point, (node) => node.id !== draggedId && node.type !== 'boundaryEvent');
  const fromNode = hitNode ? lanes.find((lane) => lane.nodeIds.includes(hitNode))?.id : undefined;
  const fromBand = smallestIdAt(lanes, layout, point, () => true);
  const laneId = fromNode ?? fromBand;
  if (!laneId) return undefined;
  if (lanes.some((lane) => lane.id === laneId && lane.nodeIds.includes(draggedId))) return undefined;
  return laneId;
}

function smallestIdAt<T extends { id: string }>(
  items: readonly T[],
  layout: ReturnType<typeof layoutProcess>,
  point: { x: number; y: number },
  keep: (item: T) => boolean,
): string | undefined {
  let best: { id: string; area: number } | undefined;
  for (const item of items) {
    if (!keep(item)) continue;
    const box = layout.shapes[item.id];
    if (!box || !contains(box, point)) continue;
    const size = area(box);
    if (!best || size < best.area) best = { id: item.id, area: size };
  }
  return best?.id;
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
