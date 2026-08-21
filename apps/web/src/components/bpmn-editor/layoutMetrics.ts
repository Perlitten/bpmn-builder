// Keep the modeling rail and inspector in their stable desktop positions on
// small laptops. The bottom-bar layout is reserved for genuinely phone-sized
// viewports, where a side rail would consume too much of the canvas.
export const COMPACT_MAX_WIDTH = 560;

export function isCompactViewport(width: number): boolean {
  return width <= COMPACT_MAX_WIDTH;
}

export const PALETTE_RAIL_WIDTH = 64;
export const ARCHITECT_MARGIN = 12;
export const ARCHITECT_PANEL_WIDTH = 280;
export const ARCHITECT_PANEL_ESTIMATE_HEIGHT = 240;
export const MOBILE_PALETTE_BAR = 56;
export const ZOOM_CONTROLS_SIZE = 44;
export const FIT_INSET = 12;
