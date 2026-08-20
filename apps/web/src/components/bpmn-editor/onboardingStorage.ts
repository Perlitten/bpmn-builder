export const EDITOR_ONBOARDING_KEY = 'bpmn.editorOnboarding.v1';

export const EDITOR_ONBOARDING_COPY =
  'Double-click a shape to rename it. Select a shape to append steps. To move around, choose Pan or hold Space while dragging the canvas.';

export function readEditorOnboardingSeen(storage: Pick<Storage, 'getItem'> | null = null): boolean {
  try {
    return (storage ?? globalThis.localStorage).getItem(EDITOR_ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeEditorOnboardingSeen(storage: Pick<Storage, 'setItem'> | null = null): void {
  try {
    (storage ?? globalThis.localStorage).setItem(EDITOR_ONBOARDING_KEY, '1');
  } catch {
    /* private mode — still dismissed for this mount */
  }
}
