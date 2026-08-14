import {
  bpmnComponentRegistry,
  DEFAULT_BPMN_TYPE,
  type FlowNode,
  type FlowNodeType,
  type Process,
  type SequenceFlow,
} from '../../semantic-core/src/index.js';

export type LintKind = 'start' | 'end' | 'task' | 'gateway' | 'event';

export type LintNode = {
  id: string;
  name: string;
  kind: LintKind;
  layoutType: string;
  coreType: FlowNodeType;
  bpmnType?: string;
  eventDefinition?: string;
};

export type LintFlow = {
  id: string;
  source: string | null;
  target: string | null;
  name: string;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LintModel = {
  nodes: LintNode[];
  flows: LintFlow[];
  bounds: Record<string, Bounds>;
  hasDi: boolean;
  parseError?: string;
};

const NODE_KIND: Record<string, LintKind> = {
  startevent: 'start',
  endevent: 'end',
  intermediatecatchevent: 'event',
  intermediatethrowevent: 'event',
  exclusivegateway: 'gateway',
  parallelgateway: 'gateway',
  inclusivegateway: 'gateway',
  eventbasedgateway: 'gateway',
  complexgateway: 'gateway',
  adhocsubprocess: 'task',
  transaction: 'task',
  task: 'task',
  usertask: 'task',
  servicetask: 'task',
  sendtask: 'task',
  receivetask: 'task',
  scripttask: 'task',
  businessruletask: 'task',
  manualtask: 'task',
  callactivity: 'task',
  subprocess: 'task',
  boundaryevent: 'event',
};

const CORE_TYPE: Record<string, FlowNodeType> = {
  start: 'start',
  end: 'end',
  exclusivegateway: 'exclusiveGateway',
  parallelgateway: 'parallelGateway',
  inclusivegateway: 'inclusiveGateway',
  eventbasedgateway: 'eventBasedGateway',
  adhocsubprocess: 'task',
  transaction: 'task',
  boundaryevent: 'boundaryEvent',
  intermediatecatchevent: 'intermediateCatch',
};

const NODE_ALT = Object.keys(NODE_KIND).join('|');

export function isSemanticGraph(value: unknown): value is Process {
  if (value === null || typeof value !== 'object') return false;
  const p = value as Process;
  return Array.isArray(p.nodes) && Array.isArray(p.flows);
}

export function toLintModel(input: unknown): LintModel {
  if (typeof input === 'string') return fromXml(input);
  if (isSemanticGraph(input)) return fromGraph(input);
  if (input !== null && typeof input === 'object' && 'bpmnXml' in input) {
    const xml = (input as { bpmnXml?: unknown }).bpmnXml;
    if (typeof xml === 'string') return fromXml(xml);
    return { nodes: [], flows: [], bounds: {}, hasDi: false, parseError: 'Process has no BPMN XML' };
  }
  return { nodes: [], flows: [], bounds: {}, hasDi: false, parseError: 'Unsupported lint input' };
}

function fromGraph(process: Process): LintModel {
  return {
    nodes: process.nodes.map((node) => fromCoreNode(node)),
    flows: process.flows.map((flow) => fromCoreFlow(flow)),
    bounds: {},
    hasDi: false,
  };
}

function fromCoreNode(node: FlowNode): LintNode {
  const kind: LintKind =
    node.type === 'start'
      ? 'start'
      : node.type === 'end'
        ? 'end'
        : node.type.endsWith('Gateway')
          ? 'gateway'
          : node.type === 'boundaryEvent' || node.type === 'intermediateCatch'
            ? 'event'
            : 'task';
  return {
    id: node.id,
    name: node.name ?? '',
    kind,
    layoutType: node.type,
    coreType: node.type,
    bpmnType: node.bpmnType ?? DEFAULT_BPMN_TYPE[node.type],
    ...(node.eventDefinition ? { eventDefinition: node.eventDefinition } : {}),
  };
}

export function bpmnTypeFromTag(tag: string): string | undefined {
  return bpmnComponentRegistry.list().find((def) => def.bpmnType.replace(/^bpmn:/, '').toLowerCase() === tag)?.bpmnType;
}

function fromCoreFlow(flow: SequenceFlow): LintFlow {
  return {
    id: flow.id,
    source: flow.source ? flow.source : null,
    target: flow.target ? flow.target : null,
    name: flow.name ?? '',
  };
}

function localTag(name: string): string {
  const i = name.indexOf(':');
  return (i >= 0 ? name.slice(i + 1) : name).toLowerCase();
}

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const key = localTag(match[1]);
    out[key] = decode(match[2] ?? match[3] ?? '');
  }
  return out;
}

function decode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function collect(xml: string, tagAlt: string): { tag: string; attr: Record<string, string> }[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?(${tagAlt})\\b([^>]*?)(\\/)?>`, 'gi');
  const found: { tag: string; attr: Record<string, string> }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    found.push({ tag: localTag(match[1]), attr: attrs(match[2] ?? '') });
  }
  return found;
}

function processBodies(xml: string): string[] {
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<(?:[\w.-]+:)?BPMNDiagram\b[\s\S]*?<\/(?:[\w.-]+:)?BPMNDiagram>/gi, '');
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
  return bodies;
}

function parseBounds(xml: string): Record<string, Bounds> {
  const bounds: Record<string, Bounds> = {};
  const shapeRe = /<(?:[\w.-]+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?BPMNShape>/gi;
  let match: RegExpExecArray | null;
  while ((match = shapeRe.exec(xml))) {
    const id = attrs(match[1] ?? '').bpmnelement;
    if (!id) continue;
    const box = /<(?:[\w.-]+:)?Bounds\b([^>]*?)\/>/i.exec(match[2] ?? '');
    if (!box) continue;
    const a = attrs(box[1] ?? '');
    const x = Number(a.x);
    const y = Number(a.y);
    const width = Number(a.width);
    const height = Number(a.height);
    if (![x, y, width, height].every(Number.isFinite)) continue;
    bounds[id] = { x, y, width, height };
  }
  return bounds;
}

function fromXml(xml: string): LintModel {
  const trimmed = xml.trim();
  if (!trimmed) {
    return { nodes: [], flows: [], bounds: {}, hasDi: false, parseError: 'Empty BPMN XML' };
  }
  const bodies = processBodies(trimmed);
  if (!bodies.length && !/<(?:[\w.-]+:)?definitions\b/i.test(trimmed)) {
    return { nodes: [], flows: [], bounds: {}, hasDi: false, parseError: 'Could not parse BPMN XML' };
  }

  const nodes: LintNode[] = [];
  const seen = new Set<string>();
  const flows: LintFlow[] = [];
  for (const body of bodies) {
    for (const hit of collect(body, NODE_ALT)) {
      const kind = NODE_KIND[hit.tag];
      const id = hit.attr.id;
      if (!kind || !id || seen.has(id)) continue;
      seen.add(id);
      const coreType =
        CORE_TYPE[hit.tag] ??
        (kind === 'start' ? 'start' : kind === 'end' ? 'end' : kind === 'gateway' ? 'exclusiveGateway' : 'task');
      nodes.push({
        id,
        name: hit.attr.name ?? '',
        kind,
        layoutType: hit.tag === 'startevent' ? 'start' : hit.tag === 'endevent' ? 'end' : CORE_TYPE[hit.tag] ?? hit.tag,
        coreType,
        bpmnType: bpmnTypeFromTag(hit.tag) ?? DEFAULT_BPMN_TYPE[coreType],
      });
    }
    for (const hit of collect(body, 'sequenceflow')) {
      flows.push({
        id: hit.attr.id || `flow_${flows.length + 1}`,
        source: hit.attr.sourceref || null,
        target: hit.attr.targetref || null,
        name: hit.attr.name ?? '',
      });
    }
  }

  const bounds = parseBounds(trimmed);
  return { nodes, flows, bounds, hasDi: Object.keys(bounds).length > 0 };
}
