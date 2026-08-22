export type BpmnPreview = {
  kind: 'empty' | 'invalid' | 'starter' | 'process';
  happyPath: string;
  branches: string[];
  counts: string;
};

type FlowNodeKind =
  | 'start'
  | 'end'
  | 'intermediate'
  | 'task'
  | 'subprocess'
  | 'xor'
  | 'and'
  | 'or';

type FlowNode = {
  id: string;
  kind: FlowNodeKind;
  label: string;
  order: number;
};

type Flow = { id: string; source: string; target: string; order: number };

const TASK_TAGS: Record<string, FlowNodeKind> = {
  task: 'task',
  usertask: 'task',
  servicetask: 'task',
  sendtask: 'task',
  receivetask: 'task',
  scripttask: 'task',
  businessruletask: 'task',
  manualtask: 'task',
  callactivity: 'task',
  subprocess: 'subprocess',
};

const GATEWAY_TAGS: Record<string, FlowNodeKind> = {
  exclusivegateway: 'xor',
  eventbasedgateway: 'xor',
  complexgateway: 'xor',
  parallelgateway: 'and',
  inclusivegateway: 'or',
};

const EVENT_TAGS: Record<string, FlowNodeKind> = {
  startevent: 'start',
  endevent: 'end',
  intermediatecatchevent: 'intermediate',
  intermediatethrowevent: 'intermediate',
  boundaryevent: 'intermediate',
};

const NODE_TAGS = { ...TASK_TAGS, ...GATEWAY_TAGS, ...EVENT_TAGS };
const NODE_TAG_ALT = Object.keys(NODE_TAGS).join('|');
const MAX_PATH = 14;
const MAX_BRANCH = 5;

function localTag(name: string): string {
  const i = name.indexOf(':');
  return (i >= 0 ? name.slice(i + 1) : name).toLowerCase();
}

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const key = match[1].includes(':') ? match[1].slice(match[1].indexOf(':') + 1) : match[1];
    out[key.toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return out;
}

function stripXmlComments(xml: string): string {
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf('<!--', cursor);
    if (start < 0) {
      parts.push(xml.slice(cursor));
      break;
    }
    parts.push(xml.slice(cursor, start));
    const end = xml.indexOf('-->', start + 4);
    if (end < 0) break;
    cursor = end + 3;
  }
  return parts.join('');
}

function stripIgnored(xml: string): string {
  return stripXmlComments(xml)
    .replace(/<(?:[\w.-]+:)?BPMNDiagram\b[\s\S]*?<\/(?:[\w.-]+:)?BPMNDiagram>/gi, '');
}

function collectProcessBodies(xml: string): string[] | null {
  const cleaned = stripIgnored(xml);
  const bodies: string[] = [];
  const openRe = /<(?:[\w.-]+:)?process\b([^>]*?)(\/)?>/gi;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(cleaned))) {
    if (match[2]) {
      bodies.push('');
      continue;
    }
    const innerStart = match.index + match[0].length;
    const rest = cleaned.slice(innerStart);
    const close = rest.search(/<\/(?:[\w.-]+:)?process>/i);
    if (close < 0) {
      bodies.push(rest);
      break;
    }
    bodies.push(rest.slice(0, close));
    openRe.lastIndex = innerStart + close;
  }
  return bodies.length ? bodies : null;
}

function collapseSubprocesses(body: string): string {
  let current = body;
  for (let i = 0; i < 8; i += 1) {
    const next = current.replace(
      /<(?:[\w.-]+:)?subProcess\b([^>]*?)>([\s\S]*?)<\/(?:[\w.-]+:)?subProcess>/gi,
      (_all, rawAttrs: string) => `<subProcess${rawAttrs} />`,
    );
    if (next === current) break;
    current = next;
  }
  return current;
}

function collectTags(xml: string, tagAlt: string): { tag: string; attr: Record<string, string>; order: number }[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?(${tagAlt})\\b([^>]*?)(\\/)?>`, 'gi');
  const found: { tag: string; attr: Record<string, string>; order: number }[] = [];
  let match: RegExpExecArray | null;
  let order = 0;
  while ((match = re.exec(xml))) {
    found.push({ tag: localTag(match[1]), attr: attrs(match[2] ?? ''), order: order++ });
  }
  return found;
}

function fallbackLabel(kind: FlowNodeKind, named: string): string {
  const trimmed = named.trim();
  if (trimmed) return trimmed;
  if (kind === 'xor') return 'XOR';
  if (kind === 'and') return 'AND';
  if (kind === 'or') return 'OR';
  if (kind === 'subprocess') return 'Subprocess';
  if (kind === 'task') return 'Task';
  if (kind === 'start') return 'Start';
  if (kind === 'end') return 'End';
  return 'Event';
}

function glyph(node: FlowNode): string {
  if (node.kind === 'start') return '●';
  if (node.kind === 'end') return '◎';
  if (node.kind === 'intermediate') return '○';
  if (node.kind === 'xor') return '◇';
  if (node.kind === 'and') return '◆';
  if (node.kind === 'or') return '◇';
  const label = node.label.replace(/\s+/g, ' ').trim() || 'Task';
  const clipped = label.length > 22 ? `${label.slice(0, 20)}…` : label;
  return node.kind === 'subprocess' ? `⟦${clipped}⟧` : `[${clipped}]`;
}

function formatCounts(nodes: FlowNode[]): string {
  let tasks = 0;
  let subprocesses = 0;
  let xor = 0;
  let and = 0;
  let or = 0;
  let starts = 0;
  let ends = 0;
  for (const node of nodes) {
    if (node.kind === 'task') tasks += 1;
    else if (node.kind === 'subprocess') subprocesses += 1;
    else if (node.kind === 'xor') xor += 1;
    else if (node.kind === 'and') and += 1;
    else if (node.kind === 'or') or += 1;
    else if (node.kind === 'start') starts += 1;
    else if (node.kind === 'end') ends += 1;
  }
  const parts: string[] = [];
  if (tasks) parts.push(`${tasks} ${tasks === 1 ? 'task' : 'tasks'}`);
  if (subprocesses) parts.push(`${subprocesses} subprocess${subprocesses === 1 ? '' : 'es'}`);
  if (xor) parts.push(`${xor} XOR`);
  if (and) parts.push(`${and} AND`);
  if (or) parts.push(`${or} OR`);
  if (starts > 1) parts.push(`${starts} starts`);
  if (ends) parts.push(`${ends} ${ends === 1 ? 'end' : 'ends'}`);
  return parts.join(' · ');
}

function parseGraph(processXml: string): { nodes: FlowNode[]; flows: Flow[] } {
  const nodeHits = collectTags(processXml, NODE_TAG_ALT);
  const nodes: FlowNode[] = [];
  for (const hit of nodeHits) {
    const kind = NODE_TAGS[hit.tag];
    const id = hit.attr.id;
    if (!kind || !id) continue;
    nodes.push({
      id,
      kind,
      label: fallbackLabel(kind, hit.attr.name ?? ''),
      order: hit.order,
    });
  }
  const flows: Flow[] = collectTags(processXml, 'sequenceflow').flatMap((hit, index) => {
    const id = hit.attr.id || `flow_${index}`;
    const source = hit.attr.sourceref;
    const target = hit.attr.targetref;
    if (!source || !target) return [];
    return [{ id, source, target, order: hit.order }];
  });
  return { nodes, flows };
}

function walkPath(
  startId: string,
  byId: Map<string, FlowNode>,
  outgoing: Map<string, Flow[]>,
  limit: number,
): { text: string; branches: { from: string; path: string }[] } {
  const parts: string[] = [];
  const branches: { from: string; path: string }[] = [];
  const visited = new Set<string>();
  let current = startId;
  let steps = 0;

  while (current && steps < limit) {
    if (visited.has(current)) {
      parts.push('↺');
      break;
    }
    visited.add(current);
    const node = byId.get(current);
    if (!node) break;
    parts.push(glyph(node));
    steps += 1;
    if (node.kind === 'end') break;

    const outs = outgoing.get(current) ?? [];
    if (outs.length === 0) break;
    const [happy, ...rest] = outs;
    for (const flow of rest) {
      branches.push({
        from: node.id,
        path: walkLinear(flow.target, byId, outgoing, visited, MAX_BRANCH),
      });
    }
    if (!happy) break;
    parts.push('──');
    current = happy.target;
  }

  return { text: parts.join(''), branches };
}

function walkLinear(
  startId: string,
  byId: Map<string, FlowNode>,
  outgoing: Map<string, Flow[]>,
  blocked: Set<string>,
  limit: number,
): string {
  const parts: string[] = [];
  const visited = new Set(blocked);
  let current = startId;
  let steps = 0;
  while (current && steps < limit) {
    if (visited.has(current)) {
      parts.push('↺');
      break;
    }
    visited.add(current);
    const node = byId.get(current);
    if (!node) break;
    parts.push(glyph(node));
    steps += 1;
    if (node.kind === 'end') break;
    const next = (outgoing.get(current) ?? [])[0];
    if (!next) break;
    parts.push('──');
    current = next.target;
  }
  return parts.join('');
}

function isStarter(nodes: FlowNode[], flows: Flow[]): boolean {
  if (nodes.length !== 3 || flows.length !== 2) return false;
  const kinds = nodes.map((node) => node.kind).sort().join(',');
  if (kinds !== 'end,start,task') return false;
  const task = nodes.find((node) => node.kind === 'task');
  return task?.label === 'Task';
}

export function previewBpmn(xml: string | null | undefined): BpmnPreview {
  if (!xml || !xml.trim()) {
    return { kind: 'empty', happyPath: 'Empty process', branches: [], counts: '' };
  }

  const bodies = collectProcessBodies(xml);
  if (bodies === null) {
    return { kind: 'invalid', happyPath: 'Could not parse BPMN', branches: [], counts: '' };
  }

  let graph = { nodes: [] as FlowNode[], flows: [] as Flow[] };
  let countGraph = { nodes: [] as FlowNode[], flows: [] as Flow[] };
  for (const body of bodies) {
    const counted = parseGraph(body);
    const parsed = parseGraph(collapseSubprocesses(body));
    if (parsed.nodes.length > graph.nodes.length) {
      graph = parsed;
      countGraph = counted;
    }
  }
  if (graph.nodes.length === 0) {
    return { kind: 'empty', happyPath: 'Empty process', branches: [], counts: '' };
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, Flow[]>();
  const incoming = new Map<string, number>();
  for (const flow of graph.flows) {
    const list = outgoing.get(flow.source) ?? [];
    list.push(flow);
    outgoing.set(flow.source, list);
    incoming.set(flow.target, (incoming.get(flow.target) ?? 0) + 1);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => a.order - b.order);
  }

  const starts = graph.nodes.filter((node) => node.kind === 'start').sort((a, b) => a.order - b.order);
  const roots = graph.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  const startId = starts[0]?.id ?? roots[0]?.id ?? graph.nodes[0]?.id;
  if (!startId) {
    return { kind: 'empty', happyPath: 'Empty process', branches: [], counts: formatCounts(countGraph.nodes) };
  }

  const walked = walkPath(startId, byId, outgoing, MAX_PATH);
  const counts = formatCounts(countGraph.nodes);
  const branchTexts = walked.branches.map((branch) => branch.path).filter(Boolean);

  if (isStarter(graph.nodes, graph.flows)) {
    return { kind: 'starter', happyPath: walked.text, branches: [], counts };
  }

  return { kind: 'process', happyPath: walked.text || 'Empty process', branches: branchTexts, counts };
}

export function previewStructure(preview: BpmnPreview): string {
  const split = preview.branches.length;
  const branch = split > 0 ? `${split + 1} branches` : '';
  if (preview.kind === 'starter') {
    return ['Starter', preview.counts].filter(Boolean).join(' · ');
  }
  return [preview.counts, branch].filter(Boolean).join(' · ') || preview.happyPath;
}

export function processNameFromDescription(text: string): string {
  const firstLine = text.trim().split(/\r?\n/)[0]?.replace(/\s+/g, ' ') ?? '';
  let name = firstLine.split(/[.!?。]/, 1)[0]?.trim() ?? '';
  name = name
    .replace(/^(?:please[,\s]+)?(?:create|make|build|draw|design)\s+(?:me\s+)?(?:an?\s+|the\s+)?/i, '')
    .replace(/^(?:пожалуйста[,\s]+)?(?:сделай|создай|построй|нарисуй|спроектируй)(?:\s+мне)?\s+/iu, '')
    .replace(/^(?:bpmn\s+)?(?:process|workflow|diagram|процесс|схем[ау]|диаграмм[ау])\s+(?:for\s+|для\s+)?/iu, '')
    .split(/\s+(?:with|where|that|which|including|с|со|где|котор(?:ый|ая|ое|ые)|в котором)\s+/iu, 1)[0]!
    .trim();
  if (!name) return 'Untitled process';
  name = `${name.charAt(0).toLocaleUpperCase()}${name.slice(1)}`;
  return name.length > 56 ? `${name.slice(0, 53).trimEnd()}…` : name;
}

export function processNameFromBpmn(xml: string, fileName: string): string {
  const named = /<(?:[\w.-]+:)?process\b[^>]*\bname="([^"]+)"/i.exec(xml)?.[1]?.trim();
  if (named) return named;
  const base = fileName.replace(/\.(bpmn|xml)$/i, '').trim();
  return base || 'Imported process';
}
