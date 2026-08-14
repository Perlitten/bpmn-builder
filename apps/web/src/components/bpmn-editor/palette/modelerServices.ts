import type { DiagramElement } from '../diagramElement';

type Getter = { get: (name: string, strict?: boolean) => unknown };

export function gfxAnchor(
  modeler: Getter,
  element: DiagramElement,
  host: HTMLElement,
): { left: number; top: number } | null {
  const registry = modeler.get('elementRegistry') as {
    getGraphics: (el: unknown) => SVGElement | undefined;
  };
  const gfx = registry.getGraphics(element);
  if (!gfx) return null;
  const box = gfx.getBoundingClientRect();
  const hostBox = host.getBoundingClientRect();
  return {
    left: box.right - hostBox.left + 8,
    top: box.top - hostBox.top + box.height / 2,
  };
}
