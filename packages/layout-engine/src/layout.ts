import { visibleNodeName, type Process } from '../../semantic-core/src/index.js';
import { routeOrthogonal, routeOrthogonalVertical } from './route.js';
import { fromSemanticProcess } from './semanticAdapter.js';
import { BASELINE_CY, ORIGIN_X, snapToGrid, TOKENS } from './tokens.js';
import type {
  Bounds,
  Branch,
  LayoutArtifact,
  LayoutInput,
  LayoutLane,
  LayoutNode,
  LayoutResult,
  Point,
  SequenceFlow,
  StructuredRegion,
} from './types.js';

type Extent = { width: number; above: number; below: number };

type ChainItem =
  | { kind: 'node'; id: string; type: string }
  | { kind: 'region'; region: StructuredRegion };

type Ctx = {
  nodes: Map<string, LayoutNode>;
  outgoing: Map<string, SequenceFlow[]>;
  regionBySplit: Map<string, StructuredRegion>;
  topLevelBySplit: Map<string, StructuredRegion>;
  interior: Set<string>;
  flowGap: number;
};

/** Vertical band a lane owns. Height comes from lane content, never from pool/laneCount. */
type LaneBand = { y: number; height: number };

type GraphResult = { result: LayoutResult; bands: Map<string, LaneBand> };

export function layout(input: LayoutInput): LayoutResult {
  const inner = layoutGraph(input, collaborationFlowGap(input), hostLanes(input));
  if (!hasCollaboration(input)) return inner.result;
  return layoutCollaboration(input, inner);
}

export function layoutProcess(process: Process | unknown): LayoutResult {
  return layout(fromSemanticProcess(process));
}

function hasCollaboration(input: LayoutInput): boolean {
  return (
    (input.participants?.length ?? 0) > 0 ||
    (input.lanes?.length ?? 0) > 0 ||
    (input.messageFlows?.length ?? 0) > 0
  );
}

function collaborationFlowGap(input: LayoutInput): number {
  return hasCollaboration(input) ? TOKENS.poolInnerFlowGap : TOKENS.forwardFlowGap;
}

function layoutGraph(
  input: Pick<LayoutInput, 'nodes' | 'sequenceFlows' | 'regions' | 'artifacts' | 'participants' | 'lanes'>,
  flowGap: number = TOKENS.forwardFlowGap,
  lanes: LayoutLane[] = [],
): GraphResult {
  const ctx = index(input, flowGap);
  const placed = new Map<string, Bounds>();
  placeChain(buildMainChain(input, ctx), ORIGIN_X, BASELINE_CY, placed, ctx);
  placeLooseEventSubprocesses(input.regions ?? [], placed, ctx);
  placeRemainder(input, placed, ctx);
  placeArtifacts(input.artifacts ?? [], placed);

  const edges: LayoutResult['edges'] = Object.assign(
    Object.create(null),
    associationEdges(input.artifacts ?? [], placed),
    routeSequenceFlows(input.sequenceFlows, placed, input.regions ?? [], ctx),
  );
  const shapes = sortRecord(placed);
  const labels = collectLabels(input, input.sequenceFlows, shapes, edges);

  /* Lane membership moves nodes vertically only; the canonical chain owns X. */
  const bands = lanes.length ? applyLaneBands(input, lanes, placed, ctx, labels) : new Map<string, LaneBand>();

  return {
    result: {
      shapes,
      edges,
      labels,
    },
    bands,
  };
}

function unionBounds(boxes: Bounds[]): Bounds | null {
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function bbox(shapes: Record<string, Bounds>, extra?: Record<string, Bounds>): Bounds | null {
  return unionBounds([...Object.values(shapes), ...Object.values(extra ?? {})]);
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function ceilToGrid(value: number, grid = TOKENS.baseGrid): number {
  return Math.ceil(value / grid) * grid;
}

/** Top-level lanes of one participant, in declaration order. */
function topLanes(lanes: LayoutLane[], participantId: string): LayoutLane[] {
  return lanes.filter((l) => l.participantId === participantId && !l.parentLaneId);
}

/** Lanes that band the root process: the host pool's, or every lane when there is no pool. */
function hostLanes(input: LayoutInput): LayoutLane[] {
  const top = (input.lanes ?? []).filter((l) => !l.parentLaneId);
  if (!top.length) return [];
  const participants = input.participants ?? [];
  if (!participants.length) return top;
  const host = participants.find((p) => p.processId != null && p.processId === input.processId);
  return host ? topLanes(top, host.id) : [];
}

function bandStack(lanes: LayoutLane[], bands: Map<string, LaneBand>): Bounds | null {
  const boxes = lanes
    .map((lane) => bands.get(lane.id))
    .filter((b): b is LaneBand => b != null)
    .map((b) => ({ x: 0, y: b.y, width: 0, height: b.height }));
  return unionBounds(boxes);
}

/**
 * Groups that must keep their relative geometry when a lane band moves:
 * subprocess contents follow their container, boundary events follow their host.
 */
function clusterOwners(
  input: Pick<LayoutInput, 'nodes' | 'regions'>,
  ctx: Ctx,
): Map<string, string> {
  const owner = new Map<string, string>();
  const claim = (region: StructuredRegion, root: string): void => {
    for (const branch of region.branches) {
      for (const id of branch.nodes) if (id !== root && !owner.has(id)) owner.set(id, root);
    }
    for (const nested of region.nested ?? []) {
      for (const id of [nested.split, nested.join]) {
        if (id && id !== root && !owner.has(id)) owner.set(id, root);
      }
      claim(nested, root);
    }
  };
  for (const region of flattenRegions(input.regions ?? [])) {
    if (isContainerRegion(region, ctx) && !owner.has(region.split)) claim(region, region.split);
  }
  for (const node of input.nodes) {
    if (node.attachedTo) owner.set(node.id, owner.get(node.attachedTo) ?? node.attachedTo);
  }
  return owner;
}

/** Lane index per placed shape: flowNodeRef first, then flow/association neighbours, then lane 1. */
function laneIndexByShape(
  input: Pick<LayoutInput, 'nodes' | 'sequenceFlows' | 'regions' | 'artifacts'>,
  lanes: LayoutLane[],
  placed: Map<string, Bounds>,
  ctx: Ctx,
): Map<string, number> {
  const owner = clusterOwners(input, ctx);
  const rootOf = (id: string): string => owner.get(id) ?? id;
  const laneOfCluster = new Map<string, number>();
  lanes.forEach((lane, i) => {
    for (const id of lane.nodeIds) if (rootOf(id) === id && !laneOfCluster.has(id)) laneOfCluster.set(id, i);
  });
  lanes.forEach((lane, i) => {
    for (const id of lane.nodeIds) {
      const root = rootOf(id);
      if (!laneOfCluster.has(root)) laneOfCluster.set(root, i);
    }
  });

  const links = [
    ...input.sequenceFlows.map((f) => ({ id: f.id, source: f.source, target: f.target })),
    ...(input.artifacts ?? [])
      .filter((a) => a.kind === 'association' && a.source && a.target)
      .map((a) => ({ id: a.id, source: a.source!, target: a.target! })),
  ].sort((a, b) => a.id.localeCompare(b.id));
  for (let pass = 0; pass <= links.length; pass++) {
    let grew = false;
    for (const link of links) {
      const source = rootOf(link.source);
      const target = rootOf(link.target);
      const inSource = laneOfCluster.get(source);
      const inTarget = laneOfCluster.get(target);
      if (inSource != null && inTarget == null) {
        laneOfCluster.set(target, inSource);
        grew = true;
      } else if (inTarget != null && inSource == null) {
        laneOfCluster.set(source, inTarget);
        grew = true;
      }
    }
    if (!grew) break;
  }

  const out = new Map<string, number>();
  for (const id of placed.keys()) out.set(id, laneOfCluster.get(rootOf(id)) ?? 0);
  return out;
}

/**
 * Moves every placed shape into the vertical band of the lane that claims it.
 * Band height follows lane content (empty lanes keep `laneMinHeight`), never `pool / laneCount`.
 */
function applyLaneBands(
  input: Pick<LayoutInput, 'nodes' | 'sequenceFlows' | 'regions' | 'artifacts' | 'participants' | 'lanes'>,
  lanes: LayoutLane[],
  placed: Map<string, Bounds>,
  ctx: Ctx,
  labels: Record<string, Bounds> = {},
): Map<string, LaneBand> {
  const pad = TOKENS.poolPad;
  const laneOf = laneIndexByShape(input, lanes, placed, ctx);
  const members = lanes.map<string[]>(() => []);
  for (const id of [...placed.keys()].sort((a, b) => a.localeCompare(b))) {
    members[laneOf.get(id) ?? 0]!.push(id);
  }
  const content = members.map((ids) =>
    unionBounds(ids.flatMap((id) => (labels[id] ? [placed.get(id)!, labels[id]!] : [placed.get(id)!]))),
  );
  const heightOf = (box: Bounds | null): number =>
    Math.max(TOKENS.laneMinHeight, box ? ceilToGrid(box.height + 2 * pad) : 0);

  const bands: LaneBand[] = new Array(lanes.length);
  const anchor = content.findIndex((box) => box != null);
  if (anchor === -1) {
    let startY = snapToGrid(BASELINE_CY - (lanes.length * TOKENS.laneMinHeight) / 2);
    for (let i = 0; i < lanes.length; i++) {
      bands[i] = { y: startY, height: TOKENS.laneMinHeight };
      startY += TOKENS.laneMinHeight;
    }
    return new Map(lanes.map((lane, i) => [lane.id, bands[i]!]));
  }

  /* The first lane with content keeps its canonical Y; the rest stack around it. */
  const anchorBox = content[anchor]!;
  bands[anchor] = {
    y: anchorBox.y - pad,
    height: Math.max(TOKENS.laneMinHeight, anchorBox.height + 2 * pad),
  };
  let above = bands[anchor]!.y;
  for (let i = anchor - 1; i >= 0; i--) {
    const height = heightOf(content[i] ?? null);
    above -= height;
    bands[i] = { y: above, height };
  }
  let below = bands[anchor]!.y + bands[anchor]!.height;
  for (let i = anchor + 1; i < lanes.length; i++) {
    const height = heightOf(content[i] ?? null);
    bands[i] = { y: below, height };
    below += height;
  }

  for (let i = 0; i < lanes.length; i++) {
    const box = content[i];
    if (!box || i === anchor) continue;
    const dy = snapToGrid(bands[i]!.y + bands[i]!.height / 2 - (box.y + box.height / 2));
    if (!dy) continue;
    for (const id of members[i]!) placed.get(id)!.y += dy;
  }
  return new Map(lanes.map((lane, i) => [lane.id, bands[i]!]));
}

function translateResult(result: LayoutResult, dx: number, dy: number): void {
  for (const box of Object.values(result.shapes)) {
    box.x += dx;
    box.y += dy;
  }
  for (const pts of Object.values(result.edges)) {
    for (const p of pts) {
      p.x += dx;
      p.y += dy;
    }
  }
  for (const box of Object.values(result.labels)) {
    box.x += dx;
    box.y += dy;
  }
}

function snapBoxOut(x: number, y: number, width: number, height: number): Bounds {
  const grid = TOKENS.baseGrid;
  const x0 = Math.floor(x / grid) * grid;
  const y0 = Math.floor(y / grid) * grid;
  const x1 = Math.ceil((x + width) / grid) * grid;
  const y1 = Math.ceil((y + height) / grid) * grid;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function layoutCollaboration(input: LayoutInput, root: GraphResult): LayoutResult {
  const inner = root.result;
  const shapes: Record<string, Bounds> = Object.assign(Object.create(null), inner.shapes);
  const edges: Record<string, Point[]> = Object.assign(Object.create(null), inner.edges);
  const labels: Record<string, Bounds> = Object.assign(Object.create(null), inner.labels);
  const participants = input.participants ?? [];
  const lanes = input.lanes ?? [];
  const messageFlows = [...(input.messageFlows ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const peers = new Map((input.processes ?? []).map((g) => [g.id, g]));
  const rootId = input.processId;
  const pad = TOKENS.poolPad;
  const header = TOKENS.poolHeader;

  const rootShapes: Record<string, Bounds> = Object.create(null);
  const rootIds = new Set(input.nodes.map((n) => n.id));
  for (const [id, box] of Object.entries(inner.shapes)) {
    if (rootIds.has(id)) rootShapes[id] = box;
  }
  const content = bbox(rootShapes, inner.labels);

  let poolX = ORIGIN_X;
  let commonWidth: number = TOKENS.blackBox.width;
  let hostCore: Bounds | null = null;
  if (content) {
    hostCore = snapBoxOut(
      content.x - header - pad,
      content.y - pad,
      header + pad + content.width + pad,
      content.height + 2 * pad,
    );
    poolX = hostCore.x;
    commonWidth = Math.max(commonWidth, hostCore.width);
  }

  const host = participants.find((p) => p.processId != null && p.processId === rootId);
  const ordered = host ? [host, ...participants.filter((p) => p.id !== host.id)] : participants;
  let cursorY =
    hostCore != null ? hostCore.y : snapToGrid(BASELINE_CY - TOKENS.blackBox.height / 2);

  for (const part of ordered) {
    const isHost = host != null && part.id === host.id && hostCore != null;
    const peer = part.processId ? peers.get(part.processId) : undefined;
    const partLanes = topLanes(lanes, part.id);
    let bands = isHost ? root.bands : new Map<string, LaneBand>();
    let pool: Bounds;

    if (isHost && hostCore) {
      /* Lanes own the pool height: the band stack, not content ÷ laneCount. */
      const stack = bandStack(partLanes, bands);
      pool = {
        x: poolX,
        y: stack ? stack.y : hostCore.y,
        width: commonWidth,
        height: stack ? stack.height : hostCore.height,
      };
    } else if (peer) {
      const peerGraph = layoutGraph(
        {
          nodes: peer.nodes,
          sequenceFlows: peer.sequenceFlows,
          regions: peer.regions,
          artifacts: peer.artifacts,
        },
        TOKENS.poolInnerFlowGap,
        partLanes,
      );
      const peerInner = peerGraph.result;
      const peerBox = bbox(peerInner.shapes, peerInner.labels);
      const stack = bandStack(partLanes, peerGraph.bands);
      if (!peerBox) {
        pool = { x: poolX, y: cursorY, width: commonWidth, height: TOKENS.blackBox.height };
      } else {
        const width = Math.max(commonWidth, header + pad + peerBox.width + pad);
        const height = stack ? stack.height : peerBox.height + 2 * pad;
        const dy = stack ? cursorY - stack.y : cursorY + pad - peerBox.y;
        pool = { x: poolX, y: cursorY, width, height };
        translateResult(peerInner, pool.x + header + pad - peerBox.x, dy);
        for (const band of peerGraph.bands.values()) band.y += dy;
        bands = peerGraph.bands;
        Object.assign(shapes, peerInner.shapes);
        Object.assign(edges, peerInner.edges);
        Object.assign(labels, peerInner.labels);
      }
    } else {
      pool = { x: poolX, y: cursorY, width: commonWidth, height: TOKENS.blackBox.height };
    }

    shapes[part.id] = pool;
    placeLanes(shapes, partLanes, pool, header, bands);
    cursorY = pool.y + pool.height + TOKENS.poolGap;
  }

  if (!participants.length) {
    placeLanesOnly(shapes, lanes.filter((l) => !l.parentLaneId), content, root.bands);
  }

  messageFlows.forEach((mf, i) => {
    const from = shapes[mf.source];
    const to = shapes[mf.target];
    if (!from || !to) return;
    const offset = (i - (messageFlows.length - 1) / 2) * TOKENS.baseGrid * 2;
    edges[mf.id] = routeOrthogonalVertical(from, to, offset);
  });
  Object.assign(labels, collectLabels(input, messageFlows, shapes, edges));

  return {
    shapes: sortRecord(new Map(Object.entries(shapes))),
    edges: sortRecord(new Map(Object.entries(edges))),
    labels: sortRecord(new Map(Object.entries(labels))),
  };
}

function placeLanes(
  shapes: Record<string, Bounds>,
  top: LayoutLane[],
  pool: Bounds,
  header: number,
  bands: Map<string, LaneBand>,
): void {
  if (!top.length) return;
  stackLanes(shapes, top, { x: pool.x + header, y: pool.y, width: pool.width - header, height: pool.height }, bands);
}

function placeLanesOnly(
  shapes: Record<string, Bounds>,
  top: LayoutLane[],
  content: Bounds | null,
  bands: Map<string, LaneBand>,
): void {
  if (!top.length || !content) return;
  stackLanes(shapes, top, content, bands);
}

/** Bands drive lane geometry; without them lanes split the box in whole pixels. */
function stackLanes(
  shapes: Record<string, Bounds>,
  top: LayoutLane[],
  box: Bounds,
  bands: Map<string, LaneBand>,
): void {
  if (bands.size) {
    for (const lane of top) {
      const band = bands.get(lane.id);
      if (band) shapes[lane.id] = { x: box.x, y: band.y, width: box.width, height: band.height };
    }
    return;
  }
  for (let i = 0; i < top.length; i++) {
    const y = box.y + Math.round((box.height * i) / top.length);
    const next = box.y + Math.round((box.height * (i + 1)) / top.length);
    shapes[top[i]!.id] = { x: box.x, y, width: box.width, height: next - y };
  }
}

function index(
  input: Pick<LayoutInput, 'nodes' | 'sequenceFlows' | 'regions'>,
  flowGap: number,
): Ctx {
  const nodes = new Map(input.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, SequenceFlow[]>();
  for (const flow of input.sequenceFlows) {
    const list = outgoing.get(flow.source) ?? [];
    list.push(flow);
    outgoing.set(flow.source, list);
  }

  const regionBySplit = new Map<string, StructuredRegion>();
  for (const region of flattenRegions(input.regions ?? [])) {
    regionBySplit.set(region.split, region);
  }

  const inBranch = new Set<string>();
  for (const region of regionBySplit.values()) {
    for (const branch of region.branches) {
      for (const id of branch.nodes) inBranch.add(id);
    }
  }

  const topLevelBySplit = new Map<string, StructuredRegion>();
  for (const region of regionBySplit.values()) {
    if (!inBranch.has(region.split)) topLevelBySplit.set(region.split, region);
  }

  const interior = new Set(inBranch);
  for (const region of regionBySplit.values()) {
    if (!topLevelBySplit.has(region.split)) {
      interior.add(region.split);
      interior.add(region.join);
    }
  }

  return { nodes, outgoing, regionBySplit, topLevelBySplit, interior, flowGap };
}

function flattenRegions(regions: StructuredRegion[]): StructuredRegion[] {
  const out: StructuredRegion[] = [];
  const walk = (list: StructuredRegion[]) => {
    for (const region of list) {
      out.push(region);
      if (region.nested?.length) walk(region.nested);
    }
  };
  walk(regions);
  return out;
}

function flowBandIndex(flow: SequenceFlow, regions: StructuredRegion[]): number {
  for (const region of flattenRegions(regions)) {
    const i = region.branches.findIndex((b) => b.entryFlowId === flow.id);
    if (i >= 0) return i;
  }
  return Number.MAX_SAFE_INTEGER;
}

function emptyBranchRailY(
  flow: SequenceFlow,
  regions: StructuredRegion[],
  ctx: Ctx,
  placed: Map<string, Bounds>,
): number | undefined {
  for (const region of flattenRegions(regions)) {
    if (isContainerRegion(region, ctx)) continue;
    if (flow.source !== region.split || flow.target !== region.join) continue;
    let branchIndex = region.branches.findIndex((b) => b.entryFlowId === flow.id);
    if (branchIndex === -1) {
      const splitFlows = (ctx.outgoing.get(region.split) ?? []).filter((f) => f.target === region.join);
      const flowIdx = splitFlows.findIndex((f) => f.id === flow.id);
      if (flowIdx >= 0 && flowIdx < region.branches.length) {
        branchIndex = flowIdx;
      }
    }
    if (branchIndex === -1) continue;
    const splitBox = placed.get(region.split);
    if (!splitBox) continue;
    const cy = splitBox.y + splitBox.height / 2;
    const chains = region.branches.map((b) => branchItems(b, ctx));
    const extents = chains.map((items) => measureChain(items, ctx));
    const { total, bandCys } = stackMetrics(extents);
    return cy - total / 2 + bandCys[branchIndex]!;
  }
  return undefined;
}

/**
 * Empty XOR/AND/OR branches share split→join. Route them on distinct rails
 * (Yes above, No below) instead of one stroke with stacked labels.
 */
function routeSequenceFlows(
  flows: SequenceFlow[],
  placed: Map<string, Bounds>,
  regions: StructuredRegion[],
  ctx: Ctx,
): Record<string, Point[]> {
  const groups = new Map<string, SequenceFlow[]>();
  for (const flow of flows) {
    if (!placed.has(flow.source) || !placed.has(flow.target)) continue;
    const key = `${flow.source}\0${flow.target}`;
    const list = groups.get(key) ?? [];
    list.push(flow);
    groups.set(key, list);
  }
  const edges: Record<string, Point[]> = Object.create(null);
  const spacing = TOKENS.edgeClearance * 2;
  for (const group of groups.values()) {
    group.sort((a, b) => flowBandIndex(a, regions) - flowBandIndex(b, regions) || a.id.localeCompare(b.id));
    const n = group.length;
    for (let i = 0; i < n; i++) {
      const flow = group[i]!;
      const railY = emptyBranchRailY(flow, regions, ctx, placed);
      let offset = 0;
      if (railY !== undefined) {
        const fromBox = placed.get(flow.source)!;
        const cy = fromBox.y + fromBox.height / 2;
        offset = snapToGrid(railY - cy);
      } else if (n > 1) {
        offset = snapToGrid((i - (n - 1) / 2) * spacing);
      }
      edges[flow.id] = routeOrthogonal(placed.get(flow.source)!, placed.get(flow.target)!, offset);
    }
  }
  return edges;
}

function buildMainChain(input: Pick<LayoutInput, 'nodes' | 'sequenceFlows' | 'regions'>, ctx: Ctx): ChainItem[] {
  const start =
    input.nodes.find((n) => normalizeType(n.type) === 'startEvent' && !ctx.interior.has(n.id)) ??
    input.nodes.find((n) => !ctx.interior.has(n.id));
  if (!start) return [];

  const items: ChainItem[] = [];
  let id: string | undefined = start.id;
  const seen = new Set<string>();

  while (id && !seen.has(id)) {
    seen.add(id);
    const region = ctx.topLevelBySplit.get(id);
    if (region) {
      items.push({ kind: 'region', region });
      seen.add(region.join);
      id = ctx.outgoing.get(region.join)?.[0]?.target;
      continue;
    }
    items.push({ kind: 'node', id, type: typeOf(ctx, id) });
    const outs = ctx.outgoing.get(id) ?? [];
    if (outs.length > 1) {
      /* Unstructured split gateway: stop main chain here so fanUnplaced places all branches in separate bands. */
      break;
    }
    const next = outs.find((f) => !ctx.interior.has(f.target));
    id = next?.target;
  }
  return items;
}

function branchItems(branch: Branch, ctx: Ctx): ChainItem[] {
  const items: ChainItem[] = [];
  const ids = branch.nodes;
  let i = 0;
  while (i < ids.length) {
    const id = ids[i]!;
    const nested = ctx.regionBySplit.get(id);
    if (nested) {
      if (isEventContainer(nested, ctx)) {
        i++;
        continue;
      }
      items.push({ kind: 'region', region: nested });
      const joinAt = ids.indexOf(nested.join, i);
      i = joinAt === -1 ? i + 1 : joinAt + 1;
      continue;
    }
    if (ctx.nodes.get(id)?.triggeredByEvent) {
      i++;
      continue;
    }
    items.push({ kind: 'node', id, type: typeOf(ctx, id) });
    i++;
  }
  return items;
}

function placeChain(
  items: ChainItem[],
  x: number,
  cy: number,
  placed: Map<string, Bounds>,
  ctx: Ctx,
): number {
  let cursor = x;
  for (let i = 0; i < items.length; i++) {
    if (i > 0) cursor += ctx.flowGap;
    const item = items[i]!;
    if (item.kind === 'node') {
      const size = sizeOf(item.type);
      placed.set(item.id, {
        x: cursor,
        y: cy - size.height / 2,
        width: size.width,
        height: size.height,
      });
      cursor += size.width;
    } else {
      cursor = placeRegion(item.region, cursor, cy, placed, ctx);
    }
  }
  return cursor;
}

function isContainerRegion(region: StructuredRegion, ctx: Ctx): boolean {
  if (region.type === 'subprocess' || region.type === 'eventSubprocess') return true;
  const t = ctx.nodes.get(region.split)?.type ?? '';
  return t === 'subProcess' || t === 'subprocess';
}

function isEventContainer(region: StructuredRegion, ctx: Ctx): boolean {
  if (region.type === 'eventSubprocess') return true;
  return ctx.nodes.get(region.split)?.triggeredByEvent === true;
}

function containerEvents(region: StructuredRegion, ctx: Ctx): StructuredRegion[] {
  return (region.nested ?? []).filter((r) => isEventContainer(r, ctx));
}

function emptyBranch(): Branch {
  return { id: '', nodes: [] };
}

function measureSubprocess(region: StructuredRegion, ctx: Ctx): Extent {
  const pad = TOKENS.subprocessPad;
  const inner = measureChain(branchItems(region.branches[0] ?? emptyBranch(), ctx), ctx);
  const events = containerEvents(region, ctx);
  let extraH = 0;
  let extraW = 0;
  for (const ev of events) {
    const e = measureSubprocess(ev, ctx);
    extraH += TOKENS.eventSubprocessGap + e.above + e.below;
    extraW = Math.max(extraW, e.width);
  }
  const contentW = Math.max(inner.width, extraW, TOKENS.task.width);
  const contentAbove = inner.width || inner.above || inner.below ? inner.above : TOKENS.task.height / 2;
  const contentBelow =
    (inner.width || inner.above || inner.below ? inner.below : TOKENS.task.height / 2) + extraH;
  return {
    width: contentW + 2 * pad,
    above: contentAbove + pad,
    below: contentBelow + pad,
  };
}

function placeSubprocess(
  region: StructuredRegion,
  x: number,
  cy: number,
  placed: Map<string, Bounds>,
  ctx: Ctx,
): number {
  const pad = TOKENS.subprocessPad;
  const chain = branchItems(region.branches[0] ?? emptyBranch(), ctx);
  const inner = measureChain(chain, ctx);
  const extent = measureSubprocess(region, ctx);
  const box = {
    x,
    y: cy - extent.above,
    width: extent.width,
    height: extent.above + extent.below,
  };
  placed.set(region.split, box);
  placeChain(chain, x + pad, cy, placed, ctx);
  let evTop = cy + inner.below + TOKENS.eventSubprocessGap;
  for (const ev of containerEvents(region, ctx)) {
    const e = measureSubprocess(ev, ctx);
    placeSubprocess(ev, x + pad, evTop + e.above, placed, ctx);
    evTop += e.above + e.below + TOKENS.eventSubprocessGap;
  }
  return x + box.width;
}

function placeLooseEventSubprocesses(
  regions: StructuredRegion[],
  placed: Map<string, Bounds>,
  ctx: Ctx,
): void {
  const loose = regions
    .filter((r) => isEventContainer(r, ctx) && !placed.has(r.split))
    .sort((a, b) => a.split.localeCompare(b.split));
  if (!loose.length) return;
  const content = bbox(Object.fromEntries(placed));
  let y = content ? content.y + content.height + TOKENS.eventSubprocessGap : BASELINE_CY;
  const x = content?.x ?? ORIGIN_X;
  for (const region of loose) {
    const e = measureSubprocess(region, ctx);
    placeSubprocess(region, x, y + e.above, placed, ctx);
    const box = placed.get(region.split)!;
    y = box.y + box.height + TOKENS.eventSubprocessGap;
  }
}

function walkUnplacedChain(startId: string, placed: Map<string, Bounds>, ctx: Ctx): ChainItem[] {
  const items: ChainItem[] = [];
  let id: string | undefined = startId;
  const seen = new Set<string>();
  while (id && !seen.has(id) && !placed.has(id)) {
    seen.add(id);
    if (!ctx.nodes.has(id)) break;
    const nested = ctx.regionBySplit.get(id);
    if (nested && !isEventContainer(nested, ctx)) {
      items.push({ kind: 'region', region: nested });
      seen.add(nested.join);
      id = ctx.outgoing.get(nested.join)?.[0]?.target;
      continue;
    }
    items.push({ kind: 'node', id, type: typeOf(ctx, id) });
    const next = (ctx.outgoing.get(id) ?? []).find((f) => !placed.has(f.target) && !seen.has(f.target));
    id = next?.target;
  }
  return items;
}

function reachableUnplacedNodes(startId: string, placed: Map<string, Bounds>, ctx: Ctx): string[] {
  const path: string[] = [];
  let id: string | undefined = startId;
  const seen = new Set<string>();
  while (id && !seen.has(id) && !placed.has(id) && ctx.nodes.has(id)) {
    seen.add(id);
    path.push(id);
    const region = ctx.regionBySplit.get(id);
    if (region && !isEventContainer(region, ctx)) {
      if (region.join && !placed.has(region.join) && !seen.has(region.join)) {
        seen.add(region.join);
        path.push(region.join);
        id = ctx.outgoing.get(region.join)?.[0]?.target;
        continue;
      }
    }
    const outs = ctx.outgoing.get(id) ?? [];
    if (outs.length > 1) break;
    id = outs[0]?.target;
  }
  return path;
}

function findCommonSuccessor(splitId: string, placed: Map<string, Bounds>, ctx: Ctx): string | null {
  const outs = (ctx.outgoing.get(splitId) ?? []).filter((f) => f.target && !placed.has(f.target));
  if (outs.length < 2) return null;
  const branchPaths = outs.map((f) => reachableUnplacedNodes(f.target, placed, ctx));
  const firstPath = branchPaths[0] ?? [];
  for (const nodeId of firstPath) {
    if (branchPaths.slice(1).every((p) => p.includes(nodeId))) {
      return nodeId;
    }
  }
  return null;
}

function placeOpenBranches(
  splitId: string,
  chains: ChainItem[][],
  placed: Map<string, Bounds>,
  ctx: Ctx,
): number {
  const splitBox = placed.get(splitId);
  if (!splitBox) return 0;
  const extents = chains.map((items) => measureChain(items, ctx));
  const { total, bandCys } = stackMetrics(extents);
  let cy: number;
  const placedTargets = (ctx.outgoing.get(splitId) ?? [])
    .map((flow) => placed.get(flow.target))
    .filter((box): box is Bounds => box != null);

  const splitNode = ctx.nodes.get(splitId);
  const splitName = splitNode ? visibleNodeName(splitNode.type, splitNode.name) : undefined;
  const splitLabelBottom = splitName
    ? splitBox.y + splitBox.height + TOKENS.label.gap + TOKENS.label.height
    : splitBox.y + splitBox.height;

  if (placedTargets.length > 0) {
    let belowY = splitLabelBottom;
    for (const box of placedTargets) {
      belowY = Math.max(belowY, box.y + box.height);
    }
    cy = belowY + TOKENS.branchGap + total / 2;
  } else if (extents.length > 0) {
    /* Ensure lower branch band stays below gateway external label if present */
    const lastExt = extents[extents.length - 1]!;
    const lastHeight = lastExt.above + lastExt.below;
    const minCenterY = splitLabelBottom + TOKENS.branchGap + lastHeight / 2;
    cy = Math.max(splitBox.y + splitBox.height / 2, minCenterY - total / 2 + bandCys[bandCys.length - 1]!);
  } else {
    cy = splitBox.y + splitBox.height / 2;
  }

  const innerLeft = splitBox.x + splitBox.width + ctx.flowGap;
  for (let i = 0; i < chains.length; i++) {
    if (!chains[i]!.length) continue;
    placeChain(chains[i]!, innerLeft, cy - total / 2 + bandCys[i]!, placed, ctx);
  }

  const maxBranchW = Math.max(0, ...extents.map((e) => e.width));
  return innerLeft + (maxBranchW > 0 ? maxBranchW : 0);
}

function fanUnplaced(placed: Map<string, Bounds>, ctx: Ctx): boolean {
  let grew = false;
  for (const id of [...placed.keys()].sort()) {
    const missing = (ctx.outgoing.get(id) ?? [])
      .filter((f) => f.target && !placed.has(f.target) && ctx.nodes.has(f.target))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!missing.length) continue;

    const common = findCommonSuccessor(id, placed, ctx);
    if (common) {
      const branchPaths = missing.map((f) => reachableUnplacedNodes(f.target, placed, ctx));
      const chains = branchPaths.map((path) => {
        const nodeIds = path.slice(0, path.indexOf(common));
        return nodeIds.map((nodeId) => ({ kind: 'node' as const, id: nodeId, type: typeOf(ctx, nodeId) }));
      });
      const endX = placeOpenBranches(id, chains, placed, ctx);
      const splitBox = placed.get(id)!;
      const suffixLeft = endX > splitBox.x + splitBox.width + ctx.flowGap ? endX + ctx.flowGap : splitBox.x + splitBox.width + ctx.flowGap;
      const suffixChain = walkUnplacedChain(common, placed, ctx);
      placeChain(suffixChain, suffixLeft, splitBox.y + splitBox.height / 2, placed, ctx);
      grew = true;
      continue;
    }

    const chains = missing.map((f) => walkUnplacedChain(f.target, placed, ctx)).filter((c) => c.length);
    if (!chains.length) continue;
    placeOpenBranches(id, chains, placed, ctx);
    grew = true;
  }
  return grew;
}

function placeBoundaryEvents(input: Pick<LayoutInput, 'nodes'>, placed: Map<string, Bounds>): boolean {
  let grew = false;
  const boundaries = input.nodes
    .filter((n) => n.attachedTo && !placed.has(n.id) && placed.has(n.attachedTo))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const node of boundaries) {
    const host = placed.get(node.attachedTo!)!;
    const size = sizeOf(node.type);
    placed.set(node.id, {
      x: snapToGrid(host.x + host.width / 2 - size.width / 2),
      y: snapToGrid(host.y + host.height - size.height / 2),
      width: size.width,
      height: size.height,
    });
    grew = true;
  }
  return grew;
}

function unplacedChainRoots(
  input: Pick<LayoutInput, 'nodes' | 'sequenceFlows'>,
  placed: Map<string, Bounds>,
  ctx: Ctx,
): string[] {
  const unplaced = new Set<string>();
  for (const node of input.nodes) {
    if (node.id && !placed.has(node.id) && ctx.nodes.has(node.id)) unplaced.add(node.id);
  }
  if (!unplaced.size) return [];
  const hasUnplacedPred = new Set<string>();
  for (const flow of input.sequenceFlows) {
    if (unplaced.has(flow.source) && unplaced.has(flow.target)) hasUnplacedPred.add(flow.target);
  }
  const eligible = [...unplaced].filter((id) => !ctx.nodes.get(id)?.attachedTo);
  const roots = eligible.filter((id) => !hasUnplacedPred.has(id)).sort((a, b) => a.localeCompare(b));
  if (roots.length) return roots;
  return eligible.sort((a, b) => a.localeCompare(b)).slice(0, 1);
}

function fanUnplacedSources(
  input: Pick<LayoutInput, 'nodes' | 'sequenceFlows'>,
  placed: Map<string, Bounds>,
  ctx: Ctx,
): boolean {
  const roots = unplacedChainRoots(input, placed, ctx);
  if (!roots.length) return false;
  const chains = roots.map((id) => walkUnplacedChain(id, placed, ctx)).filter((c) => c.length);
  if (!chains.length) return false;
  const content = bbox(Object.fromEntries(placed));
  const x = content?.x ?? ORIGIN_X;
  const top = content ? content.y + content.height + TOKENS.branchGap : BASELINE_CY;
  const extents = chains.map((items) => measureChain(items, ctx));
  const { total, bandCys } = stackMetrics(extents);
  const cy = top + total / 2;
  for (let i = 0; i < chains.length; i++) {
    placeChain(chains[i]!, x, cy - total / 2 + bandCys[i]!, placed, ctx);
  }
  return true;
}

function artifactSize(kind: LayoutArtifact['kind']): { width: number; height: number } {
  if (kind === 'dataObject') return { width: TOKENS.dataObject.width, height: TOKENS.dataObject.height };
  if (kind === 'dataStore') return { width: TOKENS.dataStore.width, height: TOKENS.dataStore.height };
  if (kind === 'textAnnotation') return { width: TOKENS.textAnnotation.width, height: TOKENS.textAnnotation.height };
  return { width: TOKENS.group.width, height: TOKENS.group.height };
}

function placeArtifacts(artifacts: LayoutArtifact[], placed: Map<string, Bounds>): void {
  const shapes = artifacts
    .filter((item) => item.kind !== 'association' && item.id && !placed.has(item.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!shapes.length) return;
  const content = bbox(Object.fromEntries(placed));
  let x = content?.x ?? ORIGIN_X;
  const y = content ? content.y + content.height + TOKENS.branchGap : BASELINE_CY;
  for (const item of shapes) {
    const size = artifactSize(item.kind);
    placed.set(item.id, { x, y, width: size.width, height: size.height });
    x += size.width + TOKENS.artifactGap;
  }
}

function associationEdges(artifacts: LayoutArtifact[], placed: Map<string, Bounds>): Record<string, Point[]> {
  const edges: Record<string, Point[]> = Object.create(null);
  for (const item of artifacts.filter((a) => a.kind === 'association').sort((a, b) => a.id.localeCompare(b.id))) {
    if (!item.source || !item.target) continue;
    const from = placed.get(item.source);
    const to = placed.get(item.target);
    if (from && to) edges[item.id] = routeOrthogonal(from, to);
  }
  return edges;
}

function placeOrphans(input: Pick<LayoutInput, 'nodes'>, placed: Map<string, Bounds>, ctx: Ctx): void {
  const leftover = input.nodes.filter((n) => n.id && !placed.has(n.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (!leftover.length) return;
  const content = bbox(Object.fromEntries(placed));
  let x = content?.x ?? ORIGIN_X;
  const y = content ? content.y + content.height + TOKENS.branchGap : BASELINE_CY;
  for (const node of leftover) {
    const size = sizeOf(node.type);
    placed.set(node.id, { x, y, width: size.width, height: size.height });
    x += size.width + ctx.flowGap;
  }
}

function placeRemainder(
  input: Pick<LayoutInput, 'nodes' | 'sequenceFlows' | 'regions'>,
  placed: Map<string, Bounds>,
  ctx: Ctx,
): void {
  const limit = input.nodes.length + 2;
  for (let i = 0; i < limit; i++) {
    const grew =
      fanUnplaced(placed, ctx) || placeBoundaryEvents(input, placed) || fanUnplacedSources(input, placed, ctx);
    if (!grew) break;
  }
  placeOrphans(input, placed, ctx);
}

function placeRegion(
  region: StructuredRegion,
  x: number,
  cy: number,
  placed: Map<string, Bounds>,
  ctx: Ctx,
): number {
  if (isContainerRegion(region, ctx)) return placeSubprocess(region, x, cy, placed, ctx);
  const splitSize = sizeOf(typeOf(ctx, region.split));
  placed.set(region.split, {
    x,
    y: cy - splitSize.height / 2,
    width: splitSize.width,
    height: splitSize.height,
  });

  const chains = region.branches.map((b) => branchItems(b, ctx));
  const extents = chains.map((items) => measureChain(items, ctx));
  const innerW = Math.max(0, ...extents.map((e) => e.width));
  const { total, bandCys } = stackMetrics(extents);
  const innerLeft = innerW > 0 ? x + splitSize.width + ctx.flowGap : x + splitSize.width;

  for (let i = 0; i < chains.length; i++) {
    if (!chains[i]!.length) continue;
    placeChain(chains[i]!, innerLeft, cy - total / 2 + bandCys[i]!, placed, ctx);
  }

  const joinSize = sizeOf(typeOf(ctx, region.join));
  const joinX =
    innerW > 0
      ? innerLeft + innerW + ctx.flowGap
      : x + splitSize.width + ctx.flowGap;
  placed.set(region.join, {
    x: joinX,
    y: cy - joinSize.height / 2,
    width: joinSize.width,
    height: joinSize.height,
  });
  return joinX + joinSize.width;
}

function measureChain(items: ChainItem[], ctx: Ctx): Extent {
  if (!items.length) return { width: 0, above: 0, below: 0 };
  let width = 0;
  let above = 0;
  let below = 0;
  for (let i = 0; i < items.length; i++) {
    if (i > 0) width += ctx.flowGap;
    const item = items[i]!;
    const e = item.kind === 'node' ? nodeExtent(item.type) : measureRegion(item.region, ctx);
    width += e.width;
    above = Math.max(above, e.above);
    below = Math.max(below, e.below);
  }
  return { width, above, below };
}

function measureRegion(region: StructuredRegion, ctx: Ctx): Extent {
  if (isContainerRegion(region, ctx)) return measureSubprocess(region, ctx);
  const split = nodeExtent(typeOf(ctx, region.split));
  const join = nodeExtent(typeOf(ctx, region.join));
  const branches = region.branches.map((b) => {
    const ext = measureChain(branchItems(b, ctx), ctx);
    if (!ext.width && !ext.above && !ext.below) {
      return { width: 0, above: TOKENS.gateway.height / 2, below: TOKENS.gateway.height / 2 };
    }
    return ext;
  });
  const innerW = Math.max(0, ...branches.map((e) => e.width));
  const { total } = stackMetrics(branches);
  const half = total / 2;
  return {
    width:
      split.width +
      ctx.flowGap +
      (innerW > 0 ? innerW + ctx.flowGap : 0) +
      join.width,
    above: Math.max(split.above, join.above, half),
    below: Math.max(split.below, join.below, half),
  };
}

function stackMetrics(branches: Extent[]): { total: number; bandCys: number[] } {
  let accY = 0;
  const bandCys: number[] = [];
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]!;
    bandCys.push(accY + b.above);
    accY += b.above + b.below;
    if (i < branches.length - 1) accY += TOKENS.branchGap;
  }
  return { total: accY, bandCys };
}

function nodeExtent(type: string): Extent {
  const size = sizeOf(type);
  return { width: size.width, above: size.height / 2, below: size.height / 2 };
}

function normalizeType(type: string): string {
  if (type === 'start') return 'startEvent';
  if (type === 'end') return 'endEvent';
  return type;
}

function sizeOf(type: string): { width: number; height: number } {
  const t = normalizeType(type);
  if (
    t === 'startEvent' ||
    t === 'endEvent' ||
    t === 'boundaryEvent' ||
    t === 'intermediateCatch'
  ) {
    return { width: TOKENS.event.width, height: TOKENS.event.height };
  }
  if (/gateway/i.test(t)) return { width: TOKENS.gateway.width, height: TOKENS.gateway.height };
  return { width: TOKENS.task.width, height: TOKENS.task.height };
}

function typeOf(ctx: Ctx, id: string): string {
  const node = ctx.nodes.get(id);
  if (!node) throw new Error(`layout: unknown node ${id}`);
  return node.type;
}

function isExternalLabelType(type: string): boolean {
  const t = normalizeType(type);
  return (
    t === 'startEvent' ||
    t === 'endEvent' ||
    t === 'boundaryEvent' ||
    t === 'intermediateCatch' ||
    /gateway/i.test(t)
  );
}

function labelSize(name: string): { width: number; height: number } {
  const text = name.trim();
  return {
    width: Math.max(TOKENS.label.width, text.length * TOKENS.label.charWidth + TOKENS.label.padX * 2),
    height: TOKENS.label.height,
  };
}

function externalLabelBox(shape: Bounds, name: string): Bounds {
  const size = labelSize(name);
  return {
    x: shape.x + shape.width / 2 - size.width / 2,
    y: shape.y + shape.height + TOKENS.label.gap,
    width: size.width,
    height: size.height,
  };
}

function flowLabelBox(points: Point[], name: string): Bounds {
  const size = labelSize(name);
  const last = points.length - 1;
  const a = points[Math.floor(last / 2)]!;
  const b = points[Math.ceil(last / 2)]!;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  return {
    x: midX - size.width / 2,
    y: midY - TOKENS.label.flowIndent - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function clearOfObstacles(box: Bounds, obstacles: Bounds[]): Bounds {
  if (!obstacles.some((obs) => intersects(box, obs))) return box;

  const grid = TOKENS.baseGrid;
  const maxR = 40;
  for (let r = 1; r <= maxR; r++) {
    const dist = r * grid;
    const candidates: Point[] = [
      { x: 0, y: -dist },
      { x: 0, y: dist },
      { x: -dist, y: 0 },
      { x: dist, y: 0 },
    ];
    for (let k = 1; k < r; k++) {
      const kd = k * grid;
      candidates.push(
        { x: kd, y: -dist },
        { x: -kd, y: -dist },
        { x: kd, y: dist },
        { x: -kd, y: dist },
        { x: -dist, y: kd },
        { x: -dist, y: -kd },
        { x: dist, y: kd },
        { x: dist, y: -kd },
      );
    }
    candidates.push(
      { x: -dist, y: -dist },
      { x: dist, y: -dist },
      { x: -dist, y: dist },
      { x: dist, y: dist },
    );

    for (const offset of candidates) {
      const candidate: Bounds = {
        x: box.x + offset.x,
        y: box.y + offset.y,
        width: box.width,
        height: box.height,
      };
      if (!obstacles.some((obs) => intersects(candidate, obs))) {
        return candidate;
      }
    }
  }
  return box;
}

function collectLabels(
  input: Pick<LayoutInput, 'nodes' | 'participants' | 'lanes' | 'artifacts'>,
  namedEdges: Array<{ id: string; name?: string }>,
  shapes: Record<string, Bounds>,
  edges: Record<string, Point[]>,
): Record<string, Bounds> {
  const containerIds = new Set([
    ...(input.participants ?? []).map((p) => p.id),
    ...(input.lanes ?? []).map((l) => l.id),
  ]);
  const nodeObstacles = Object.entries(shapes)
    .filter(([id]) => !containerIds.has(id))
    .map(([, box]) => box);

  const labels = new Map<string, Bounds>();
  const obstacles = [...nodeObstacles];
  const nodes = input.nodes ?? [];
  for (const node of nodes) {
    if (!isExternalLabelType(node.type)) continue;
    const name = visibleNodeName(node.type, node.name);
    if (!name) continue;
    const box = shapes[node.id];
    if (!box) continue;
    const initialLabelBox = externalLabelBox(box, name);
    const clearedLabelBox = clearOfObstacles(initialLabelBox, obstacles);
    labels.set(node.id, clearedLabelBox);
    obstacles.push(clearedLabelBox);
  }

  for (const edge of [...namedEdges].sort((a, b) => a.id.localeCompare(b.id))) {
    const name = edge.name?.trim();
    if (!name) continue;
    const points = edges[edge.id];
    if (!points?.length) continue;
    const box = clearOfObstacles(flowLabelBox(points, name), obstacles);
    labels.set(edge.id, box);
    obstacles.push(box);
  }
  return sortRecord(labels);
}

function sortRecord<T>(placed: Map<string, T>): Record<string, T> {
  return Object.fromEntries([...placed.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
