export const EDITOR_ONBOARDING_KEY = 'bpmn.editorOnboarding.v1';

export const EDITOR_ONBOARDING_DESKTOP_COPY =
  'Double-click a shape to rename it. Select a shape to append steps. To move around, choose Pan or hold Space while dragging the canvas.';

export const EDITOR_ONBOARDING_MOBILE_COPY =
  'Tap a shape to select it, then rename it in the inspector. Select a shape to append steps. To move around, choose Pan and drag the canvas.';

export function editorOnboardingCopy(compact: boolean): string {
  return compact ? EDITOR_ONBOARDING_MOBILE_COPY : EDITOR_ONBOARDING_DESKTOP_COPY;
}

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
