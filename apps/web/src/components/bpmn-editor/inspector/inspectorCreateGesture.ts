/**
 * Canvas select can mount inspector controls between mousedown and mouseup.
 * Add lane must not treat that click-through as create — only pointerdown on
 * the control itself, or a keyboard-generated click (detail === 0).
 */
export type InspectorCreateGate = {
  pointerDown: (button?: number) => boolean;
  click: (detail?: number) => boolean;
  reset: () => void;
};

export function createInspectorCreateGate(): InspectorCreateGate {
  let pointerDownOnControl = false;
  return {
    pointerDown(button = 0) {
      pointerDownOnControl = button === 0;
      return pointerDownOnControl;
    },
    click(detail = 0) {
      if (pointerDownOnControl) {
        pointerDownOnControl = false;
        return false;
      }
      return detail === 0;
    },
    reset() {
      pointerDownOnControl = false;
    },
  };
}
