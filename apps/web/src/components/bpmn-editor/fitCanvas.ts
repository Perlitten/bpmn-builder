/** Ids only — rename must not look like a bounds change. */
export function participantSetKey(graph: {
  participants?: ReadonlyArray<{ id: string }>;
  lanes?: ReadonlyArray<{ id: string }>;
}): string {
  const pools = (graph.participants ?? []).map((part) => part.id).sort().join(',');
  const lanes = (graph.lanes ?? []).map((lane) => lane.id).sort().join(',');
  return `${pools}|${lanes}`;
}

/** First import (no previous key) or a pool/lane id set change. */
export function shouldFitCanvas(previousKey: string | undefined, nextKey: string): boolean {
  return previousKey === undefined || previousKey !== nextKey;
}

/** Fit on first paint, or when session reports the participant set changed. */
export function shouldApplyFit(alreadyFitted: boolean, participantSetChanged: boolean): boolean {
  return !alreadyFitted || participantSetChanged;
}

type NodeSet = { nodes: ReadonlyArray<{ id: string }> };

/** True when the commit introduced flow nodes — a rename or a move never does. */
export function hasNewNodes(previous: NodeSet | undefined, next: NodeSet): boolean {
  if (!previous) return false;
  const before = new Set(previous.nodes.map((node) => node.id));
  return next.nodes.some((node) => !before.has(node.id));
}
