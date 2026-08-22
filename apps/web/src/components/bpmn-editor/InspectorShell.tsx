import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { IconButton } from '../ui';

const DEFAULT_WIDTH = 252;
const MIN_WIDTH = 220;
const MAX_WIDTH = 380;

export function clampInspectorWidth(width: number, stageWidth?: number): number {
  const available = stageWidth ? Math.max(MIN_WIDTH, Math.floor(stageWidth * 0.4)) : MAX_WIDTH;
  return Math.min(Math.max(width, MIN_WIDTH), Math.min(MAX_WIDTH, available));
}

export function InspectorShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const resizeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const stage = handle.closest<HTMLElement>('.bpmn-editor-stage');
    const startX = event.clientX;
    const startWidth = width;
    handle.setPointerCapture(event.pointerId);

    const move = (next: globalThis.PointerEvent) => {
      setWidth(clampInspectorWidth(startWidth + startX - next.clientX, stage?.clientWidth));
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  return (
    <aside
      className={`element-inspector${collapsed ? ' is-collapsed' : ''}`}
      aria-label="Process inspector"
      style={{ '--inspector-current-width': `${width}px` } as CSSProperties}
    >
      <IconButton
        label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
        className="element-inspector-toggle"
        tooltipSide="left"
        aria-expanded={!collapsed}
        aria-controls="process-inspector-content"
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? <ChevronLeft size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
      </IconButton>
      <div
        className="element-inspector-resize"
        role="separator"
        aria-label="Resize inspector"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={collapsed ? -1 : 0}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        onPointerDown={resizeFromPointer}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const delta = event.key === 'ArrowLeft' ? 10 : -10;
          const stage = event.currentTarget.closest<HTMLElement>('.bpmn-editor-stage');
          setWidth((value) => clampInspectorWidth(value + delta, stage?.clientWidth));
        }}
      />
      <div id="process-inspector-content" className="element-inspector-content">
        {children}
      </div>
    </aside>
  );
}
