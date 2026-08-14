export const LIST_ARCHITECT_GAP = 8;
export const LIST_ARCHITECT_EDGE = 8;

export type ListArchitectPanelBox = {
  top: number;
  right: number;
  maxHeight: number;
};

/** Place the list Architect dialog below the full header, never under the bar or above the viewport. */
export function listArchitectPanelBox(
  mascot: { right: number; bottom: number },
  headerBottom: number,
  viewport: { width: number; height: number },
): ListArchitectPanelBox {
  const top = Math.max(mascot.bottom, headerBottom, 0) + LIST_ARCHITECT_GAP;
  const right = Math.max(LIST_ARCHITECT_EDGE, viewport.width - mascot.right);
  const maxHeight = Math.max(96, viewport.height - top - LIST_ARCHITECT_EDGE);
  return { top, right, maxHeight };
}

export function listArchitectPanelStyle(box: ListArchitectPanelBox): ListArchitectPanelBox {
  return { top: box.top, right: box.right, maxHeight: box.maxHeight };
}
