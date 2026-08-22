import { useLayoutEffect, useRef, type RefObject } from 'react';
import { focusableIn } from './useModal';

type UsePopoverOptions = {
  open: boolean;
  onClose: () => void;
};

/** Initial focus and Escape handling for non-modal popovers. Tab is never trapped. */
export function usePopover({ open, onClose }: UsePopoverOptions): { ref: RefObject<HTMLDivElement | null> } {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const marked = root.querySelector<HTMLElement>('[data-popover-initial-focus]');
      (marked ?? focusableIn(root)[0] ?? root).focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
      if (root.contains(document.activeElement)) restore?.focus();
    };
  }, [open]);

  return { ref };
}
