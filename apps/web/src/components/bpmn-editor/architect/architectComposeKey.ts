/** Keyboard shape used by Architect compose (React synthetic or native). */
export type ArchitectComposeKey = {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

function isImeComposing(event: ArchitectComposeKey): boolean {
  if (event.isComposing || event.nativeEvent?.isComposing) return true;
  return event.keyCode === 229 || event.nativeEvent?.keyCode === 229;
}

/** Enter sends. Shift+Enter inserts a newline. IME composition is ignored. */
export function isArchitectComposeSubmitKey(event: ArchitectComposeKey): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false;
  return !isImeComposing(event);
}
