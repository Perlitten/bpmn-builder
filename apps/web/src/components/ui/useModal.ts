import { useLayoutEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function wrapFocusIndex(count: number, current: number, shiftKey: boolean): number {
  if (count <= 0) return 0;
  if (shiftKey) return current <= 0 ? count - 1 : current - 1;
  return current >= count - 1 ? 0 : current + 1;
}

export function focusableIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  });
}

export function trapTabKey(root: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const nodes = focusableIn(root);
  if (nodes.length === 0) {
    event.preventDefault();
    if (root.tabIndex >= 0) root.focus();
    return;
  }
  const current = nodes.findIndex((el) => el === document.activeElement);
  if (current === -1) {
    event.preventDefault();
    (event.shiftKey ? nodes[nodes.length - 1] : nodes[0])?.focus();
    return;
  }
  const atEdge = event.shiftKey ? current === 0 : current === nodes.length - 1;
  if (!atEdge) return;
  event.preventDefault();
  nodes[wrapFocusIndex(nodes.length, current, event.shiftKey)]?.focus();
}

type UseModalOptions = {
  open: boolean;
  onClose: () => void;
};

export function useModal({ open, onClose }: UseModalOptions): { ref: RefObject<HTMLDivElement | null> } {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusInitial = () => {
      const marked = root.querySelector<HTMLElement>('[data-modal-initial-focus]');
      (marked ?? focusableIn(root)[0] ?? root).focus();
    };
    const frame = requestAnimationFrame(focusInitial);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      trapTabKey(root, event);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey, true);
      restore?.focus();
    };
  }, [open]);

  return { ref };
}
