import { Maximize2, Minus, Plus } from 'lucide-react';
import './zoomControls.css';

type BpmnZoomControlsProps = {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
};

export function BpmnZoomControls({ scale, onZoomIn, onZoomOut, onFit, onReset }: BpmnZoomControlsProps) {
  return (
    <div className="bpmn-zoom-controls pointer-events-auto absolute bottom-3 left-3 z-10 flex items-center border border-border bg-canvas font-mono text-[11px]">
      <button
        type="button"
        className="rounded-lg p-2 text-ink hover:bg-surface"
        aria-label="Zoom out"
        onClick={onZoomOut}
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        className="min-w-12 px-1 text-xs font-medium text-muted hover:text-ink"
        aria-label="Reset zoom to 100%"
        onClick={onReset}
      >
        {Math.round(scale * 100)}%
      </button>
      <button
        type="button"
        className="rounded-lg p-2 text-ink hover:bg-surface"
        aria-label="Zoom in"
        onClick={onZoomIn}
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        className="rounded-lg p-2 text-ink hover:bg-surface"
        aria-label="Fit to viewport"
        onClick={onFit}
      >
        <Maximize2 size={16} />
      </button>
    </div>
  );
}
