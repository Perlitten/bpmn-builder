import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ArchitectMascot } from './ArchitectMascot';
import {
  ARCHITECT_COMPANION_HEIGHT,
  ARCHITECT_COMPANION_WIDTH,
  ARCHITECT_PANEL_ESTIMATE_HEIGHT,
  ARCHITECT_PANEL_WIDTH,
  architectStorage,
  clampArchitectPosition,
  companionMode,
  isArchitectDragIgnoreTarget,
  isArchitectDragMove,
  readArchitectOpen,
  readArchitectPosition,
  writeArchitectOpen,
  writeArchitectPosition,
  type ArchitectSurface,
  type Point,
} from './architectPosition';
import { resolveMascotMood } from './mascotMood';
import { useCompactViewport } from '../compactViewport';

type ArchitectShellProps = {
  surface: ArchitectSurface;
  persistOpen?: boolean;
  busy?: boolean;
  error?: boolean;
  success?: boolean;
  children: ReactNode;
};

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function settle(current: Point, next: Point) {
  return current.x === next.x && current.y === next.y ? current : next;
}

function chromeSize(open: boolean, el: HTMLElement | null) {
  if (!open) return { width: ARCHITECT_COMPANION_WIDTH, height: ARCHITECT_COMPANION_HEIGHT };
  if (!el) return { width: ARCHITECT_PANEL_WIDTH, height: ARCHITECT_PANEL_ESTIMATE_HEIGHT + 72 };
  return { width: el.offsetWidth, height: el.offsetHeight };
}

type DragKind = 'mascot' | 'panel';

type DragState = {
  pointerId: number;
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  kind: DragKind;
  moved: boolean;
};

export function ArchitectShell({
  surface,
  persistOpen = true,
  busy,
  error,
  success,
  children,
}: ArchitectShellProps) {
  const compact = useCompactViewport();
  const mode = companionMode(surface, compact);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draggingRef = useRef(false);
  const [open, setOpen] = useState(() => {
    if (compact) return false;
    return persistOpen ? readArchitectOpen(architectStorage()) : false;
  });
  const [pos, setPos] = useState<Point>(() =>
    readArchitectPosition(
      architectStorage(),
      viewportSize(),
      { width: ARCHITECT_COMPANION_WIDTH, height: ARCHITECT_COMPANION_HEIGHT },
      surface,
    ),
  );
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);

  const clampTo = useCallback(
    (next: Point) => clampArchitectPosition(next, viewportSize(), chromeSize(open, shellRef.current), surface),
    [open, surface],
  );

  const setOpenState = useCallback(
    (next: boolean) => {
      if (busy && !next) return;
      setOpen(next);
      if (persistOpen) writeArchitectOpen(architectStorage(), next);
    },
    [busy, persistOpen],
  );

  useLayoutEffect(() => {
    if (draggingRef.current || mode === 'dock') return;
    setPos((current) => settle(current, clampTo(current)));
  }, [clampTo, mode, open, busy, error, success]);

  useEffect(() => {
    const onResize = () => setPos((current) => settle(current, clampTo(current)));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampTo]);

  useEffect(() => {
    if (mode === 'dock') setOpen(false);
  }, [mode]);

  useEffect(() => {
    if (!open || busy) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenState(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, open, setOpenState]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      shellRef.current?.querySelector('textarea')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const onPointerDown = (kind: DragKind) => (event: PointerEvent<HTMLElement>) => {
    if (mode !== 'float' || event.button !== 0) return;
    if (isArchitectDragIgnoreTarget(event.target)) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      dx: event.clientX - pos.x,
      dy: event.clientY - pos.y,
      startX: event.clientX,
      startY: event.clientY,
      kind,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      if (!isArchitectDragMove(event.clientX - drag.startX, event.clientY - drag.startY)) return;
      drag.moved = true;
      draggingRef.current = true;
      setDragging(true);
    }
    setPos(clampTo({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }));
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    if (!drag.moved) {
      if (event.type !== 'pointercancel' && drag.kind === 'mascot') setOpenState(!open);
      return;
    }
    setPos((current) => {
      const next = clampTo(current);
      writeArchitectPosition(architectStorage(), next);
      return settle(current, next);
    });
  };

  const onMascotKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setOpenState(!open);
  };

  if (mode === 'hidden') return null;

  const mood = resolveMascotMood({ busy, error, success, hover });
  const mascotDisabled = Boolean(busy && open);
  const dragBind =
    mode === 'float' ? { onPointerMove, onPointerUp, onPointerCancel: onPointerUp } : {};

  const shell = (
    <div
      ref={shellRef}
      className={[
        'architect-shell',
        open ? 'is-open' : 'is-collapsed',
        dragging ? 'is-dragging' : '',
        mode === 'dock' ? 'is-docked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label="Architect"
      aria-busy={busy}
      style={mode === 'dock' ? undefined : { left: pos.x, top: pos.y }}
    >
      <div className="architect-perch">
        <div
          className="architect-mascot-btn"
          role="button"
          tabIndex={mascotDisabled ? -1 : 0}
          aria-label={open ? 'Close Architect' : 'Open Architect'}
          aria-expanded={open}
          aria-disabled={mascotDisabled || undefined}
          aria-grabbed={mode === 'float' ? dragging : undefined}
          draggable={false}
          onClick={mode === 'float' ? undefined : () => setOpenState(!open)}
          onKeyDown={onMascotKeyDown}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={mode === 'float' ? onPointerDown('mascot') : undefined}
          {...dragBind}
        >
          <ArchitectMascot mood={mood} collapsed={!open} />
        </div>
      </div>
      {open ? (
        <section className="architect-panel">
          <div
            className="architect-panel-head"
            aria-label="Drag Architect"
            aria-grabbed={dragging}
            onPointerDown={mode === 'float' ? onPointerDown('panel') : undefined}
            {...dragBind}
          >
            <h2>Architect</h2>
            <button
              type="button"
              className="architect-panel-close"
              aria-label="Close Architect"
              title="Close Architect"
              disabled={busy}
              onClick={() => setOpenState(false)}
            >
              <X size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          {children}
        </section>
      ) : null}
    </div>
  );

  return createPortal(shell, document.body);
}
