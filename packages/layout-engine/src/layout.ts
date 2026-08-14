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
  LayoutParticipant,
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

export function layout(input: LayoutInput): LayoutResult {
  const inner = layoutGraph(input, collaborationFlowGap(input));
  if (!hasCollaboration(input)) return inner;
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
  input: Pick<LayoutInput, 'nodes' | 'sequenceFlows' | 'regions' | 'artifacts'>,
  flowGap: number = TOKENS.forwardFlowGap,
): LayoutResult {
  const ctx = index(input, flowGap);
  const placed = new Map<string, Bounds>();
  placeChain(buildMainChain(input, ctx), ORIGIN_X, BASELINE_CY, placed, ctx);
  placeLooseEventSubprocesses(input.regions ?? [], placed, ctx);
  placeRemainder(input, placed, ctx);
  const artifactEdges = placeArtifacts(input.artifacts ?? [], placed);

  const edges: LayoutResult['edges'] = { ...artifactEdges };
  for (const flow of [...input.sequenceFlows].sort((a, b) => a.id.localeCompare(b.id))) {
    const from = placed.get(flow.source);
    const to = placed.get(flow.target);
    if (from && to) edges[flow.id] = routeOrthogonal(from, to);
  }
  const shapes = sortRecord(placed);
  return {
    shapes,
    edges,
    labels: collectLabels(input.nodes, input.sequenceFlows, shapes, edges),
  };
}

function bbox(shapes: Record<string, Bounds>, extra?: Record<string, Bounds>): Bounds | null {
  const boxes = [...Object.values(shapes), ...Object.values(extra ?? {})];
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

function layoutCollaboration(input: LayoutInput, inner: LayoutResult): LayoutResult {
  const shapes = { ...inner.shapes };
  const edges = { ...inner.edges };
  const labels = { ...inner.labels };
  const participants = input.participants ?? [];
  const lanes = input.lanes ?? [];
  const messageFlows = [...(input.messageFlows ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const peers = new Map((input.processes ?? []).map((g) => [g.id, g]));
  const rootId = input.processId;
  const pad = TOKENS.poolPad;
  const header = TOKENS.poolHeader;

  const rootShapes: Record<string, Bounds> = {};
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
    let pool: Bounds;

    if (isHost && hostCore) {
      const emptyLanes = lanes.filter(
        (l) => l.participantId === part.id && !l.parentLaneId && l.nodeIds.length === 0,
      ).length;
      pool = {
        x: poolX,
        y: hostCore.y,
        width: commonWidth,
        height: hostCore.height + emptyLanes * TOKENS.laneMinHeight,
      };
    } else if (peer) {
      const peerInner = layoutGraph(
        {
          nodes: peer.nodes,
          sequenceFlows: peer.sequenceFlows,
          regions: peer.regions,
          artifacts: peer.artifacts,
        },
        TOKENS.poolInnerFlowGap,
      );
      const peerBox = bbox(peerInner.shapes, peerInner.labels);
      if (!peerBox) {
        pool = { x: poolX, y: cursorY, width: commonWidth, height: TOKENS.blackBox.height };
      } else {
        const width = Math.max(commonWidth, header + pad + peerBox.width + pad);
        const height = peerBox.height + 2 * pad;
        pool = { x: poolX, y: cursorY, width, height };
        translateResult(peerInner, pool.x + header + pad - peerBox.x, pool.y + pad - peerBox.y);
        Object.assign(shapes, peerInner.shapes);
        Object.assign(edges, peerInner.edges);
        Object.assign(labels, peerInner.labels);
      }
    } else {
      pool = { x: poolX, y: cursorY, width: commonWidth, height: TOKENS.blackBox.height };
    }

    shapes[part.id] = pool;
    placeLanes(shapes, lanes, part, pool, header);
    cursorY = pool.y + pool.height + TOKENS.poolGap;
  }

  if (!participants.length) {
    placeLanesOnly(shapes, lanes, content);
  }

  messageFlows.forEach((mf, i) => {
    const from = shapes[mf.source];
    const to = shapes[mf.target];
    if (!from || !to) return;
    const offset = (i - (messageFlows.length - 1) / 2) * TOKENS.baseGrid * 2;
    edges[mf.id] = routeOrthogonalVertical(from, to, offset);
  });
  Object.assign(labels, collectLabels([], messageFlows, shapes, edges));

  return {
    shapes: sortRecord(new Map(Object.entries(shapes))),
    edges: sortRecord(new Map(Object.entries(edges))),
    labels: sortRecord(new Map(Object.entries(labels))),
  };
}

function placeLanes(
  shapes: Record<string, Bounds>,
  lanes: LayoutLane[],
  part: LayoutParticipant,
  pool: Bounds,
  header: number,
): void {
  const top = lanes.filter((l) => l.participantId === part.id && !l.parentLaneId);
  if (!top.length) return;
  const laneX = pool.x + header;
  const laneW = pool.width - header;
  const owned = top.filter((l) => l.nodeIds.length);
  const empty = top.filter((l) => !l.nodeIds.length);
  if (owned.length <= 1) {
    const mainH = pool.height - empty.length * TOKENS.laneMinHeight;
    let y = pool.y;
    for (const lane of owned) {
      shapes[lane.id] = { x: laneX, y, width: laneW, height: mainH };
      y += mainH;
    }
    if (!owned.length) {
      /* equal split of the whole pool when every lane is empty */
      const h = pool.height / top.length;
      for (const lane of top) {
        shapes[lane.id] = { x: laneX, y, width: laneW, height: h };
        y += h;
      }
      return;
    }
    for (const lane of empty) {
      shapes[lane.id] = { x: laneX, y, width: laneW, height: TOKENS.laneMinHeight };
      y += TOKENS.laneMinHeight;
    }
    return;
  }
  const h = pool.height / top.length;
  let y = pool.y;
  for (const lane of top) {
    shapes[lane.id] = { x: laneX, y, width: laneW, height: h };
    y += h;
  }
}

function placeLanesOnly(shapes: Record<string, Bounds>, lanes: LayoutLane[], content: Bounds | null): void {
  const top = lanes.filter((l) => !l.parentLaneId);
  if (!top.length || !content) return;
  const h = content.height / top.length;
  let y = content.y;
  for (const lane of top) {
    shapes[lane.id] = { x: content.x, y, width: content.width, height: h };
    y += h;
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
    const next = (ctx.outgoing.get(id) ?? []).find((f) => !ctx.interior.has(f.target));
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

function placeOpenBranches(
  splitId: string,
  chains: ChainItem[][],
  placed: Map<string, Bounds>,
  ctx: Ctx,
): void {
  const splitBox = placed.get(splitId);
  if (!splitBox) return;
  const extents = chains.map((items) => measureChain(items, ctx));
  const { total, bandCys } = stackMetrics(extents);
  let belowY = splitBox.y + splitBox.height;
  for (const flow of ctx.outgoing.get(splitId) ?? []) {
    const box = placed.get(flow.target);
    if (box) belowY = Math.max(belowY, box.y + box.height);
  }
  const innerLeft = splitBox.x + splitBox.width + ctx.flowGap;
  const cy = belowY + TOKENS.branchGap + total / 2;
  for (let i = 0; i < chains.length; i++) {
    if (!chains[i]!.length) continue;
    placeChain(chains[i]!, innerLeft, cy - total / 2 + bandCys[i]!, placed, ctx);
  }
}

function fanUnplaced(placed: Map<string, Bounds>, ctx: Ctx): boolean {
  let grew = false;
  for (const id of [...placed.keys()].sort()) {
    const missing = (ctx.outgoing.get(id) ?? [])
      .filter((f) => f.target && !placed.has(f.target) && ctx.nodes.has(f.target))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!missing.length) continue;
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

function placeArtifacts(artifacts: LayoutArtifact[], placed: Map<string, Bounds>): Record<string, Point[]> {
  const shapes = artifacts
    .filter((item) => item.kind !== 'association' && item.id && !placed.has(item.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (shapes.length) {
    const content = bbox(Object.fromEntries(placed));
    let x = content?.x ?? ORIGIN_X;
    const y = content ? content.y + content.height + TOKENS.branchGap : BASELINE_CY;
    for (const item of shapes) {
      const size = artifactSize(item.kind);
      placed.set(item.id, { x, y, width: size.width, height: size.height });
      x += size.width + TOKENS.artifactGap;
    }
  }
  const edges: Record<string, Point[]> = {};
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
  let y = content ? content.y + content.height + TOKENS.branchGap : BASELINE_CY;
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
  const branches = region.branches.map((b) => measureChain(branchItems(b, ctx), ctx));
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
  let y = 0;
  const bandCys: number[] = [];
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]!;
    bandCys.push(y + b.above);
    y += b.above + b.below;
    if (i < branches.length - 1) y += TOKENS.branchGap;
  }
  return { total: y, bandCys };
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

function collectLabels(
  nodes: LayoutNode[],
  namedEdges: Array<{ id: string; name?: string }>,
  shapes: Record<string, Bounds>,
  edges: Record<string, Point[]>,
): Record<string, Bounds> {
  const labels = new Map<string, Bounds>();
  for (const node of nodes) {
    if (!isExternalLabelType(node.type)) continue;
    const name = visibleNodeName(node.type, node.name);
    if (!name) continue;
    const box = shapes[node.id];
    if (box) labels.set(node.id, externalLabelBox(box, name));
  }
  for (const edge of namedEdges) {
    const name = edge.name?.trim();
    if (!name) continue;
    const points = edges[edge.id];
    if (points?.length) labels.set(edge.id, flowLabelBox(points, name));
  }
  return sortRecord(labels);
}

function sortRecord<T>(placed: Map<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, bounds] of [...placed.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out[id] = bounds;
  }
  return out;
}
