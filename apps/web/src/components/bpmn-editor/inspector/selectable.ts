import type { DiagramElement } from '../diagramElement';

export function selectableElement(element: unknown): DiagramElement | null {
  if (!element || typeof element !== 'object' || !('id' in element) || !('type' in element)) return null;
  const node = element as DiagramElement;
  if (node.type === 'label') return selectableElement(node.labelTarget);
  if (node.type === 'bpmn:Process' || node.type === 'bpmn:Collaboration') return null;
  return node;
}

export function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

export function isEditorChromeKeyTarget(target: EventTarget | null): boolean {
  if (isEditableKeyTarget(target)) return true;
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]');
}
