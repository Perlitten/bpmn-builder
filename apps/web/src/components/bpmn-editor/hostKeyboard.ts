/** diagram-js Keyboard: bindTo was removed; bind() always uses `_target` (the SVG). */
export type EditorKeyboard = {
  bind: () => void;
  unbind: () => void;
  _target?: EventTarget | null;
  _node?: EventTarget | null;
};

/** Bind diagram shortcuts to the canvas host so name/search/Architect typing is not stolen. */
export function bindKeyboardToHost(keyboard: EditorKeyboard, host: HTMLElement): void {
  keyboard.unbind();
  keyboard._target = host;
  keyboard.bind();
}

function isMod(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

export function isCopyKey(event: KeyboardEvent): boolean {
  return isMod(event) && event.key.toLowerCase() === 'c';
}

export function isPasteKey(event: KeyboardEvent): boolean {
  return isMod(event) && event.key.toLowerCase() === 'v';
}
