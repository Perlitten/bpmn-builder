import { useMemo, type MouseEvent } from 'react';
import type { AccessibleDiagramItem } from './BpmnCanvas';

export const LARGE_DIAGRAM_SHAPES = 300;

export type DiagramViewport = { x: number; y: number; width: number; height: number };

type Bounds = DiagramViewport;

export function diagramBounds(items: AccessibleDiagramItem[]): Bounds | null {
  const placed = items.filter((item) =>
    [item.x, item.y, item.width, item.height].every((value) => typeof value === 'number'),
  );
  if (!placed.length) return null;
  const x = Math.min(...placed.map((item) => item.x!));
  const y = Math.min(...placed.map((item) => item.y!));
  const right = Math.max(...placed.map((item) => item.x! + item.width!));
  const bottom = Math.max(...placed.map((item) => item.y! + item.height!));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

type BpmnMinimapProps = {
  items: AccessibleDiagramItem[];
  viewport?: DiagramViewport;
  onNavigate: (viewport: DiagramViewport) => void;
};

export function BpmnMinimap({ items, viewport, onNavigate }: BpmnMinimapProps) {
  const bounds = useMemo(() => diagramBounds(items), [items]);
  if (!bounds || items.length <= LARGE_DIAGRAM_SHAPES) return null;

  const navigate = (event: MouseEvent<HTMLButtonElement>) => {
    if (!viewport) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = bounds.x + ((event.clientX - rect.left) / rect.width) * bounds.width - viewport.width / 2;
    const y = bounds.y + ((event.clientY - rect.top) / rect.height) * bounds.height - viewport.height / 2;
    onNavigate({ ...viewport, x, y });
  };

  return (
    <button type="button" className="bpmn-minimap" aria-label="Diagram minimap" onClick={navigate}>
      <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} aria-hidden>
        <path
          className="bpmn-minimap-shapes"
          d={items.map((item) => {
            if ([item.x, item.y, item.width, item.height].some((value) => typeof value !== 'number')) return '';
            return `M${item.x} ${item.y}h${item.width}v${item.height}h-${item.width}Z`;
          }).join('')}
        />
        {viewport ? (
          <rect
            className="bpmn-minimap-viewport"
            x={viewport.x}
            y={viewport.y}
            width={viewport.width}
            height={viewport.height}
          />
        ) : null}
      </svg>
    </button>
  );
}
