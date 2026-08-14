export type InspectorNameKeyAction = 'commit' | 'revert' | null;

export function inspectorNameKeyAction(key: string): InspectorNameKeyAction {
  if (key === 'Tab' || key === 'Enter') return 'commit';
  if (key === 'Escape') return 'revert';
  return null;
}

/**
 * Tab commits the draft and must not preventDefault — the browser then moves
 * focus (NAME → LANES). Enter/Escape are consumed so the canvas does not steal them.
 */
export function applyInspectorNameKey(event: {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
}): InspectorNameKeyAction {
  const action = inspectorNameKeyAction(event.key);
  if (!action) return null;
  event.stopPropagation();
  if (event.key !== 'Tab') event.preventDefault();
  return action;
}

export function commitInspectorName(next: string, last: string, commit: (name: string) => void): string {
  if (next === last) return last;
  commit(next);
  return next;
}
