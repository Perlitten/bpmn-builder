/** diagram-js Keyboard: bindTo was removed; bind() always uses `_target` (the SVG). */
export type EditorKeyboard = {
  bind: () => void;
  unbind: () => void;
  addListener?: (priority: number, listener: (e: { keyEvent: KeyboardEvent }) => unknown, type?: string) => void;
  _target?: EventTarget | null;
  _node?: EventTarget | null;
};

export type EditorTool = 'select' | 'pan';

export type SpacePanHold = {
  restore: EditorTool | null;
};

export type SpacePanKeyEvent = {
  key: string;
  code?: string;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

/** Higher than diagram-js HandTool (1500) so Space never toggles hand independently of the rail. */
const HAND_TOOL_SPACE_PRIORITY = 1600;

export function createSpacePanHold(): SpacePanHold {
  return { restore: null };
}

export function isSpaceKey(event: { key: string; code?: string }): boolean {
  return event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space' || event.code === 'Space';
}

function isImeComposing(event: SpacePanKeyEvent): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

function swallowHandToolSpace(e: { keyEvent: { key: string; code?: string } }): false | undefined {
  if (isSpaceKey(e.keyEvent)) return false;
}

/** Bind diagram shortcuts to the canvas host so name/search/Architect typing is not stolen. */
export function bindKeyboardToHost(keyboard: EditorKeyboard, host: HTMLElement): void {
  keyboard.unbind();
  keyboard._target = host;
  keyboard.bind();
  keyboard.addListener?.(HAND_TOOL_SPACE_PRIORITY, swallowHandToolSpace, 'keyboard.keydown');
  keyboard.addListener?.(HAND_TOOL_SPACE_PRIORITY, swallowHandToolSpace, 'keyboard.keyup');
}

/**
 * Figma-style hold-to-pan. Returns the tool to apply, or undefined when the
 * current tool should stay. preventDefault only when Space is consumed as pan.
 */
export function applySpacePanDown(
  event: SpacePanKeyEvent,
  tool: EditorTool,
  hold: SpacePanHold,
  ignoreTarget: boolean,
): EditorTool | undefined {
  if (!isSpaceKey(event)) return;
  if (hold.restore !== null) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.repeat || isImeComposing(event) || event.ctrlKey || event.metaKey || event.altKey || ignoreTarget) {
    return;
  }
  hold.restore = tool;
  event.preventDefault();
  event.stopPropagation();
  return tool === 'pan' ? undefined : 'pan';
}

export function applySpacePanUp(event: SpacePanKeyEvent, hold: SpacePanHold): EditorTool | undefined {
  if (!isSpaceKey(event) || hold.restore === null) return;
  event.stopPropagation();
  const restore = hold.restore;
  hold.restore = null;
  return restore === 'pan' ? undefined : restore;
}

export function releaseSpacePan(hold: SpacePanHold): EditorTool | undefined {
  if (hold.restore === null) return;
  const restore = hold.restore;
  hold.restore = null;
  return restore === 'pan' ? undefined : restore;
}

function isMod(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey;
}

export function isCopyKey(event: KeyboardEvent): boolean {
  return isMod(event) && !event.shiftKey && event.key.toLowerCase() === 'c';
}

export function isPasteKey(event: KeyboardEvent): boolean {
  return isMod(event) && !event.shiftKey && event.key.toLowerCase() === 'v';
}

export function isUndoKey(event: KeyboardEvent): boolean {
  return isMod(event) && !event.shiftKey && event.key.toLowerCase() === 'z';
}

export function isRedoKey(event: KeyboardEvent): boolean {
  if (!isMod(event)) return false;
  if (event.key.toLowerCase() === 'y' && !event.shiftKey) return true;
  return event.shiftKey && event.key.toLowerCase() === 'z';
}
