/** Diagram picture export. Bounds come from the laid-out model, not the on-screen viewport. */

export const DIAGRAM_EXPORT_PADDING = 32;
const PDF_MAX_PT = 14_400;

export type DiagramBox = { x: number; y: number; width: number; height: number };

export function modelBoundsFromViewbox(viewbox: {
  inner?: DiagramBox;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): DiagramBox | undefined {
  const inner = viewbox.inner;
  if (!inner || inner.width <= 0 || inner.height <= 0) return undefined;
  return { x: inner.x, y: inner.y, width: inner.width, height: inner.height };
}

export function padBox(box: DiagramBox, padding: number): DiagramBox {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: Math.max(1, box.width + padding * 2),
    height: Math.max(1, box.height + padding * 2),
  };
}

function parseSvgViewBox(svg: string): DiagramBox | undefined {
  const match = svg.match(/\bviewBox="([^"]+)"/i);
  if (!match) return undefined;
  const parts = match[1]!.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [x, y, width, height] = parts as [number, number, number, number];
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

export function isSvgMarkup(svg: string): boolean {
  return /<svg\b/i.test(svg) && /\bviewBox="/i.test(svg);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function applySvgViewBox(svg: string, box: DiagramBox): string {
  const width = round(box.width);
  const height = round(box.height);
  const viewBox = `${round(box.x)} ${round(box.y)} ${width} ${height}`;
  return svg.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
    const cleaned = String(attrs)
      .replace(/\s(width|height|viewBox)="[^"]*"/gi, '')
      .trim();
    return `<svg width="${width}" height="${height}" viewBox="${viewBox}"${cleaned ? ` ${cleaned}` : ''}>`;
  });
}

function withPageBackground(svg: string, box: DiagramBox, fill = '#ffffff'): string {
  if (/data-export-bg=/i.test(svg)) return svg;
  const rect = `<rect data-export-bg="true" x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" fill="${fill}"/>`;
  return svg.replace(/(<svg\b[^>]*>)/i, `$1${rect}`);
}

export function prepareDiagramSvg(
  svg: string,
  modelBounds?: DiagramBox | null,
  padding = DIAGRAM_EXPORT_PADDING,
): string {
  const source =
    modelBounds && modelBounds.width > 0 && modelBounds.height > 0 ? modelBounds : parseSvgViewBox(svg);
  if (!source) return svg;
  const padded = padBox(source, padding);
  return withPageBackground(applySvgViewBox(svg, padded), padded);
}

export function pdfPageSize(box: DiagramBox): { width: number; height: number } {
  const width = Math.max(1, box.width);
  const height = Math.max(1, box.height);
  const scale = Math.min(1, PDF_MAX_PT / width, PDF_MAX_PT / height);
  return { width: width * scale, height: height * scale };
}

function svgRoot(svg: string): SVGSVGElement {
  const markup = svg.replace(/^[\s\S]*?(?=<svg\b)/i, '');
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.tagName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) {
    throw new Error('Could not parse diagram SVG');
  }
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

export async function svgToPdfBlob(svg: string): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const box = parseSvgViewBox(svg) ?? { x: 0, y: 0, width: 800, height: 600 };
  const page = pdfPageSize(box);
  const doc = new jsPDF({
    orientation: page.width >= page.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [page.width, page.height],
    compress: true,
  });
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, page.width, page.height, 'F');
  const el = svgRoot(svg);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden';
  host.append(el);
  document.body.append(host);
  try {
    await svg2pdf(el, doc, { x: 0, y: 0, width: page.width, height: page.height });
  } finally {
    host.remove();
  }
  return doc.output('blob');
}

/** Raster diagram export for tickets and presentations. Keeps the canonical SVG bounds. */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const box = parseSvgViewBox(svg) ?? { x: 0, y: 0, width: 800, height: 600 };
  const factor = Number.isFinite(scale) && scale > 0 ? Math.min(4, scale) : 2;
  const width = Math.max(1, Math.ceil(box.width * factor));
  const height = Math.max(1, Math.ceil(box.height * factor));
  const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not rasterize diagram SVG'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create PNG canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode diagram PNG');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
