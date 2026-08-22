import { forwardRef } from 'react';

export const BpmnCanvas = forwardRef<HTMLDivElement>(function BpmnCanvas(_props, ref) {
  return (
    <div
      ref={ref}
      id="process-diagram"
      tabIndex={0}
      role="application"
      aria-label="Process diagram. Use arrow keys to move between elements, Enter to edit the selected name, and Delete to remove it."
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Delete"
      className="bpmn-canvas"
    />
  );
});
