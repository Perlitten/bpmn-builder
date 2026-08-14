/** bpmn-js `importXML` calls `clear()` before paint; hold the previous SVG until the next XML is on screen. */

export const IMPORT_HOLD_ATTR = 'data-import-hold';

export type ViewerXml = {
  importXML: (xml: string) => Promise<unknown>;
};

export type HoldSvg = {
  cloneNode: (deep?: boolean) => HoldClone;
  style: { visibility: string };
  parentElement: { appendChild: (node: HoldClone) => void } | null;
};

export type HoldClone = {
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
};

export type QueryRoot = {
  querySelector: (selector: string) => unknown;
};

export function isImportableXml(xml: string): boolean {
  return xml.trim().length > 0 && /<(?:[\w.-]+:)?definitions\b/i.test(xml);
}

function asHoldSvg(node: unknown): HoldSvg | null {
  if (!node || typeof node !== 'object') return null;
  return node as HoldSvg;
}

export function diagramSvgFrom(container: QueryRoot | null | undefined): HoldSvg | null {
  if (!container) return null;
  return asHoldSvg(container.querySelector('.djs-container > svg') ?? container.querySelector('svg'));
}

export function holdDiagram(svg: HoldSvg | null): { release: () => void } {
  if (!svg?.parentElement) return { release() {} };
  const clone = svg.cloneNode(true);
  clone.setAttribute(IMPORT_HOLD_ATTR, '');
  clone.setAttribute('aria-hidden', 'true');
  const prev = svg.style.visibility;
  svg.style.visibility = 'hidden';
  svg.parentElement.appendChild(clone);
  return {
    release() {
      svg.style.visibility = prev;
      clone.remove();
    },
  };
}

export async function applyXmlToViewer(
  viewer: ViewerXml,
  xml: string,
  options: {
    displayedXml?: string;
    lastGoodXml?: string;
    container?: QueryRoot | null;
    afterImport?: () => void;
    afterRestore?: () => void;
  } = {},
): Promise<void> {
  if (!isImportableXml(xml)) {
    throw new Error('Could not apply an empty diagram. The last good process is still open.');
  }
  if (options.displayedXml === xml) {
    options.afterImport?.();
    return;
  }

  const hold = holdDiagram(diagramSvgFrom(options.container));
  try {
    await viewer.importXML(xml);
    options.afterImport?.();
  } catch (error) {
    const fallback = options.lastGoodXml;
    if (fallback && fallback !== xml && isImportableXml(fallback)) {
      try {
        await viewer.importXML(fallback);
        options.afterRestore?.();
      } catch {
        /* canvas may be empty; caller still sees the hold until release */
      }
    }
    throw error;
  } finally {
    hold.release();
  }
}
