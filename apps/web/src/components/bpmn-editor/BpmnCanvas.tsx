import { forwardRef } from 'react';

export const BpmnCanvas = forwardRef<HTMLDivElement>(function BpmnCanvas(_props, ref) {
  return <div ref={ref} id="process-diagram" tabIndex={-1} className="bpmn-canvas" />;
});
