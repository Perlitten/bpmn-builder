import { forwardRef, type RefObject } from 'react';

export type AccessibleDiagramItem = {
  id: string;
  name: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export function diagramOptionId(id: string): string {
  return `diagram-option-${encodeURIComponent(id).replaceAll('%', '_')}`;
}

type BpmnCanvasProps = {
  items: AccessibleDiagramItem[];
  selectedIds: string[];
  keyboardRef: RefObject<HTMLDivElement | null>;
  simulating?: boolean;
};

export const BpmnCanvas = forwardRef<HTMLDivElement, BpmnCanvasProps>(function BpmnCanvas(
  { items, selectedIds, keyboardRef, simulating = false },
  ref,
) {
  const optionIds = items.map((item) => diagramOptionId(item.id));
  const activeId = selectedIds.find((id) => items.some((item) => item.id === id));
  return (
    <>
      <div
        ref={ref}
        className="bpmn-canvas"
        onClick={() => keyboardRef.current?.focus({ preventScroll: true })}
      />
      <div
        ref={keyboardRef}
        id="process-diagram"
        tabIndex={0}
        role="listbox"
        aria-label={simulating
          ? 'Process diagram simulation. Use arrow keys to choose an available token path, Enter or Space to advance, and Escape to exit.'
          : 'Process diagram. Use arrow keys to move between elements, Enter to edit the selected name, and Delete to remove it.'}
        aria-multiselectable="true"
        aria-activedescendant={activeId ? diagramOptionId(activeId) : undefined}
        aria-owns={optionIds.join(' ') || undefined}
        aria-keyshortcuts={simulating
          ? 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Space Escape'
          : 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Delete'}
        className="bpmn-canvas-keyboard-target"
      />
      <div className="sr-only">
        {items.map((item, index) => (
          <div
            key={item.id}
            id={diagramOptionId(item.id)}
            role="option"
            aria-selected={selectedIds.includes(item.id)}
          >
            {item.name}, {item.type}, {index + 1} of {items.length}
          </div>
        ))}
      </div>
    </>
  );
});
