import type { ResolvedCatalogItem } from './contextFilter';

export function flattenCatalogItems(
  groups: Array<{ items: ResolvedCatalogItem[] }>,
): ResolvedCatalogItem[] {
  return groups.flatMap((group) => group.items);
}

export function enabledCatalogItems(items: ResolvedCatalogItem[]): ResolvedCatalogItem[] {
  return items.filter((entry) => entry.enabled);
}

/** Enter creates a highlighted enabled row, or the only enabled match. Never unimplemented rows. */
export function catalogEnterTarget(
  items: ResolvedCatalogItem[],
  highlightedId: string | null,
): ResolvedCatalogItem | null {
  const enabled = enabledCatalogItems(items);
  if (highlightedId) {
    const hit = enabled.find((entry) => entry.item.id === highlightedId);
    if (hit) return hit;
  }
  return enabled.length === 1 ? enabled[0]! : null;
}

export function stepCatalogHighlight(
  enabled: ResolvedCatalogItem[],
  highlightedId: string | null,
  delta: number,
): string | null {
  if (enabled.length === 0) return null;
  const current = enabled.findIndex((entry) => entry.item.id === highlightedId);
  const from = current < 0 ? (delta > 0 ? -1 : 0) : current;
  const next = (from + delta + enabled.length) % enabled.length;
  return enabled[next]!.item.id;
}
