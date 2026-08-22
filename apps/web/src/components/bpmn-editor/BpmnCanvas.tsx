import { forwardRef } from 'react';

type BpmnCanvasProps = { simulating?: boolean };

export const BpmnCanvas = forwardRef<HTMLDivElement, BpmnCanvasProps>(function BpmnCanvas({ simulating = false }, ref) {
  return (
    <div
      ref={ref}
      id="process-diagram"
      tabIndex={0}
      role="application"
      aria-label={simulating
        ? 'Process diagram simulation. Use arrow keys to choose an available token path, Enter or Space to advance, and Escape to exit.'
        : 'Process diagram. Use arrow keys to move between elements, Enter to edit the selected name, and Delete to remove it.'}
      aria-keyshortcuts={simulating
        ? 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Space Escape'
        : 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Delete'}
      className="bpmn-canvas"
    />
  );
});
