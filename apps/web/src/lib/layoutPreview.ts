import { xmlToProcess } from '@bpmn/bpmn-adapter';
import { layoutProcess, type Bounds, type LayoutResult, type Point } from '@bpmn/layout-engine';
import type { Process } from '@bpmn/semantic-core';

const PAD = 16;
const cache = new Map<string, Promise<string | null>>();
const resolved = new Map<string, string | null>();

type Kind = 'start' | 'end' | 'event' | 'gateway' | 'task' | 'container';

function n(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function kindOf(type: string): Kind {
  if (type === 'participant' || type === 'lane') return 'container';
  const t = type.toLowerCase();
  if (t === 'start' || t === 'startevent') return 'start';
  if (t === 'end' || t === 'endevent') return 'end';
  if (t.includes('event')) return 'event';
  if (t.includes('gateway')) return 'gateway';
  return 'task';
}

function typeIndex(process: Process): Map<string, string> {
  const types = new Map<string, string>();
  for (const node of process.nodes) types.set(node.id, node.type);
  for (const graph of process.processes ?? []) {
    for (const node of graph.nodes) types.set(node.id, node.type);
  }
  for (const part of process.participants ?? []) types.set(part.id, 'participant');
  for (const lane of process.lanes ?? []) types.set(lane.id, 'lane');
  return types;
}

function extent(layout: LayoutResult): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const hit = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const box of Object.values(layout.shapes)) {
    hit(box.x, box.y);
    hit(box.x + box.width, box.y + box.height);
  }
  for (const box of Object.values(layout.labels ?? {})) {
    hit(box.x, box.y);
    hit(box.x + box.width, box.y + box.height);
  }
  for (const pts of Object.values(layout.edges)) {
    for (const p of pts) hit(p.x, p.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX - PAD, y: minY - PAD, width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2 };
}

function polyline(pts: Point[]): string {
  if (pts.length < 2) return '';
  const points = pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  return `<polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter" opacity="0.55" vector-effect="non-scaling-stroke" />`;
}

function shapeMarkup(kind: Kind, box: Bounds): string {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const stroke = 'stroke="currentColor" vector-effect="non-scaling-stroke"';
  if (kind === 'container') {
    return `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" fill="none" ${stroke} stroke-width="1" opacity="0.35" />`;
  }
  if (kind === 'gateway') {
    const pts = `${n(cx)},${n(box.y)} ${n(box.x + box.width)},${n(cy)} ${n(cx)},${n(box.y + box.height)} ${n(box.x)},${n(cy)}`;
    return `<polygon points="${pts}" fill="var(--color-canvas)" ${stroke} stroke-width="1.5" />`;
  }
  if (kind === 'start' || kind === 'end' || kind === 'event') {
    const r = Math.min(box.width, box.height) / 2;
    const outer = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="var(--color-canvas)" ${stroke} stroke-width="${kind === 'end' ? 1.75 : 1.5}" />`;
    if (kind !== 'end') return outer;
    return `${outer}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.62)}" fill="none" ${stroke} stroke-width="1.25" />`;
  }
  return `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" rx="6" fill="var(--color-canvas)" ${stroke} stroke-width="1.5" />`;
}

/** Canonical DI → tiny SVG. Null when there is nothing to paint. */
export function layoutToSvg(process: Process, layout: LayoutResult): string | null {
  const box = extent(layout);
  if (!box || box.width <= 0 || box.height <= 0) return null;
  const types = typeIndex(process);
  const containers: string[] = [];
  const nodes: string[] = [];
  for (const [id, bounds] of Object.entries(layout.shapes)) {
    const kind = kindOf(types.get(id) ?? 'task');
    const mark = shapeMarkup(kind, bounds);
    if (kind === 'container') containers.push(mark);
    else nodes.push(mark);
  }
  if (!nodes.length && !containers.length) return null;
  const edges = Object.values(layout.edges).map((pts) => polyline(pts)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.height)}" preserveAspectRatio="xMinYMid meet" aria-hidden="true">${containers.join('')}${edges}${nodes.join('')}</svg>`;
}

export function peekLayoutPreviewSvg(xml: string | null | undefined): string | null | undefined {
  if (!xml?.trim()) return null;
  if (resolved.has(xml)) return resolved.get(xml);
  return undefined;
}

/** `layoutProcess(xmlToProcess(xml))` scaled to an SVG string. Null if parse fails or the graph is empty. */
export function previewLayoutSvg(xml: string | null | undefined): Promise<string | null> {
  if (!xml?.trim()) return Promise.resolve(null);
  const hit = cache.get(xml);
  if (hit) return hit;
  const pending = xmlToProcess(xml)
    .then((process) => layoutToSvg(process, layoutProcess(process)))
    .catch(() => null)
    .then((svg) => {
      resolved.set(xml, svg);
      return svg;
    });
  cache.set(xml, pending);
  if (cache.size > 80) {
    const first = cache.keys().next().value;
    if (first !== undefined && first !== xml) {
      cache.delete(first);
      resolved.delete(first);
    }
  }
  return pending;
}
