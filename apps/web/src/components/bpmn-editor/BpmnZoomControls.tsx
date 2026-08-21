import { Maximize2, Minus, Plus } from 'lucide-react';
import { IconButton } from '../ui';
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
    <div className="bpmn-zoom-controls" role="group" aria-label="Canvas zoom">
      <IconButton label="Zoom in" onClick={onZoomIn}>
        <Plus size={16} aria-hidden />
      </IconButton>
      <button type="button" className="bpmn-zoom-value" aria-label="Reset zoom to 100%" onClick={onReset}>
        {Math.round(scale * 100)}%
      </button>
      <IconButton label="Zoom out" onClick={onZoomOut}>
        <Minus size={16} aria-hidden />
      </IconButton>
      <IconButton label="Fit to viewport" onClick={onFit}>
        <Maximize2 size={16} aria-hidden />
      </IconButton>
    </div>
  );
}
