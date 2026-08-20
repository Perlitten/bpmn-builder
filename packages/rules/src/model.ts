import {
  bpmnComponentRegistry,
  collectXmlElements,
  DEFAULT_BPMN_TYPE,
  type FlowNode,
  type FlowNodeType,
  parseXmlAttributes,
  type Process,
  type SequenceFlow,
} from '../../semantic-core/src/index.js';

export type LintKind = 'start' | 'end' | 'task' | 'gateway' | 'event' | 'subprocess';

export type LintNode = {
  id: string;
  name: string;
  kind: LintKind;
  layoutType: string;
  coreType: FlowNodeType;
  bpmnType?: string;
  eventDefinition?: string;
  /** Host activity id (`attachedToRef`) when this is a boundary event. */
  attachedTo?: string;
  /** Event subprocess (`triggeredByEvent`). Not on the parent sequence chain. */
  triggeredByEvent?: boolean;
  /** Boundary `cancelActivity` / start `isInterrupting`. `false` = non-interrupting. */
  cancelActivity?: boolean;
  /** Compensation handler activity (`isForCompensation`). Association, not sequence. */
  isForCompensation?: boolean;
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

export type LintAssociation = {
  id: string;
  source: string | null;
  target: string | null;
};

export type LintModel = {
  nodes: LintNode[];
  flows: LintFlow[];
  associations: LintAssociation[];
  adHocInnerIds: string[];
  bounds: Record<string, Bounds>;
  labels: Record<string, Bounds>;
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
  adhocsubprocess: 'subprocess',
  transaction: 'subprocess',
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
    return emptyModel('Process has no BPMN XML');
  }
  return emptyModel('Unsupported lint input');
}

function emptyModel(parseError?: string): LintModel {
  return { nodes: [], flows: [], associations: [], adHocInnerIds: [], bounds: {}, labels: {}, hasDi: false, ...(parseError ? { parseError } : {}) };
}

function fromGraph(process: Process): LintModel {
  const adHocOwners = new Set(
    process.nodes.filter((n) => localTag(n.bpmnType ?? '') === 'adhocsubprocess').map((n) => n.id),
  );
  const adHocInnerIds = process.scopes.flatMap((s) => (s.ownerId && adHocOwners.has(s.ownerId) ? s.nodeIds : []));
  return {
    nodes: process.nodes.map((node) => fromCoreNode(node)),
    flows: process.flows.map((flow) => fromCoreFlow(flow)),
    associations: [],
    adHocInnerIds,
    bounds: {},
    labels: {},
    hasDi: false,
  };
}

function fromCoreNode(node: FlowNode): LintNode {
  const bpmnType = node.bpmnType ?? DEFAULT_BPMN_TYPE[node.type];
  return {
    id: node.id,
    name: node.name ?? '',
    kind: kindFromBpmn(node.type, bpmnType, node.triggeredByEvent),
    layoutType: node.type,
    coreType: node.type,
    bpmnType,
    ...(node.eventDefinition ? { eventDefinition: normalizeEventDefinition(node.eventDefinition) } : {}),
    ...(node.attachedTo ? { attachedTo: node.attachedTo } : {}),
    ...(node.triggeredByEvent ? { triggeredByEvent: true } : {}),
    ...(node.cancelActivity === false ? { cancelActivity: false } : {}),
  };
}

function kindFromBpmn(coreType: string, bpmnType?: string, triggeredByEvent?: boolean): LintKind {
  const tag = localTag(bpmnType ?? coreType);
  if (coreType === 'start' || tag === 'startevent') return 'start';
  if (coreType === 'end' || tag === 'endevent') return 'end';
  if (coreType.endsWith('Gateway') || tag.endsWith('gateway')) return 'gateway';
  if (
    coreType === 'boundaryEvent' ||
    coreType === 'intermediateCatch' ||
    (tag.includes('event') && !tag.endsWith('gateway'))
  ) {
    return 'event';
  }
  if (
    triggeredByEvent ||
    coreType === 'subProcess' ||
    tag === 'subprocess' ||
    tag === 'adhocsubprocess' ||
    tag === 'transaction'
  ) {
    return 'subprocess';
  }
  return 'task';
}

/** `timerEventDefinition` / `bpmn:TimerEventDefinition` → `TimerEventDefinition`. */
export function normalizeEventDefinition(value?: string): string | undefined {
  if (!value) return undefined;
  const local = value.replace(/^bpmn:/i, '').trim();
  if (!local) return undefined;
  const m = /^(.*?)(eventdefinition)$/i.exec(local);
  if (!m) return local;
  const head = m[1] ?? '';
  if (!head) return 'EventDefinition';
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}EventDefinition`;
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

function isXmlSpace(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code === 32;
}

function isAttributeNameCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 45 ||
    code === 46 ||
    code === 58 ||
    code === 95
  );
}

function attrs(raw: string): Record<string, string> {
  const parsed = new Map<string, string>();
  let cursor = 0;
  while (cursor < raw.length) {
    while (cursor < raw.length && isXmlSpace(raw.charCodeAt(cursor))) cursor += 1;
    const nameStart = cursor;
    while (cursor < raw.length && isAttributeNameCode(raw.charCodeAt(cursor))) cursor += 1;
    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }
    const name = raw.slice(nameStart, cursor);
    while (cursor < raw.length && isXmlSpace(raw.charCodeAt(cursor))) cursor += 1;
    if (raw.charCodeAt(cursor) !== 61) continue;
    cursor += 1;
    while (cursor < raw.length && isXmlSpace(raw.charCodeAt(cursor))) cursor += 1;
    const quote = raw.charCodeAt(cursor);
    if (quote !== 34 && quote !== 39) continue;
    cursor += 1;
    const valueStart = cursor;
    while (cursor < raw.length && raw.charCodeAt(cursor) !== quote) cursor += 1;
    if (cursor >= raw.length) break;
    const key = localTag(name);
    if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
      parsed.set(key, decode(raw.slice(valueStart, cursor)));
    }
    cursor += 1;
  }
  return Object.fromEntries(parsed);
}

function decode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function collect(xml: string, tagAlt: string): { tag: string; attr: Record<string, string>; inner: string }[] {
  const parts = tagAlt.split('|');
  const found: { tag: string; attr: Record<string, string>; inner: string }[] = [];
  for (const part of parts) {
    const elements = collectXmlElements(xml, part);
    for (const el of elements) {
      const attrs = Object.fromEntries(parseXmlAttributes(el.rawAttributes));
      found.push({
        tag: el.localName,
        attr: attrs,
        inner: el.inner,
      });
    }
  }
  return found;
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

function eventDefinitionFromInner(inner: string): string | undefined {
  const match = /<(?:[\w.-]+:)?([A-Za-z]+EventDefinition)\b/i.exec(inner);
  return match ? normalizeEventDefinition(match[1]) : undefined;
}

function cancelActivityFrom(attr: Record<string, string>): boolean | undefined {
  if (attr.cancelactivity === 'false' || attr.isinterrupting === 'false') return false;
  if (attr.cancelactivity === 'true' || attr.isinterrupting === 'true') return true;
  return undefined;
}

function processBodies(xml: string): string[] {
  const cleaned = stripXmlComments(xml).replace(
    /<(?:[\w.-]+:)?BPMNDiagram\b[\s\S]*?<\/(?:[\w.-]+:)?BPMNDiagram>/gi,
    '',
  );
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

function parseBoundsAndLabels(xml: string): { bounds: Record<string, Bounds>; labels: Record<string, Bounds> } {
  const bounds: Record<string, Bounds> = Object.create(null);
  const labels: Record<string, Bounds> = Object.create(null);

  const shapeRe = /<(?:[\w.-]+:)?BPMNShape\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?BPMNShape>/gi;
  let match: RegExpExecArray | null;
  while ((match = shapeRe.exec(xml))) {
    const id = attrs(match[1] ?? '').bpmnelement;
    if (!id || id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    const body = match[2] ?? '';
    const labelMatch = /<(?:[\w.-]+:)?BPMNLabel\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?BPMNLabel>/i.exec(body);
    if (labelMatch) {
      const box = /<(?:[\w.-]+:)?Bounds\b([^>]*?)\/>/i.exec(labelMatch[1] ?? '');
      if (box) {
        const b = parseBoxAttrs(box[1] ?? '');
        if (b) labels[id] = b;
      }
    }
    const shapeBody = labelMatch ? body.slice(0, labelMatch.index) : body;
    const box = /<(?:[\w.-]+:)?Bounds\b([^>]*?)\/>/i.exec(shapeBody);
    if (box) {
      const b = parseBoxAttrs(box[1] ?? '');
      if (b) bounds[id] = b;
    }
  }

  const edgeRe = /<(?:[\w.-]+:)?BPMNEdge\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?BPMNEdge>/gi;
  while ((match = edgeRe.exec(xml))) {
    const id = attrs(match[1] ?? '').bpmnelement;
    if (!id || id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    const body = match[2] ?? '';
    const labelMatch = /<(?:[\w.-]+:)?BPMNLabel\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?BPMNLabel>/i.exec(body);
    if (labelMatch) {
      const box = /<(?:[\w.-]+:)?Bounds\b([^>]*?)\/>/i.exec(labelMatch[1] ?? '');
      if (box) {
        const b = parseBoxAttrs(box[1] ?? '');
        if (b) labels[id] = b;
      }
    }
  }

  return { bounds, labels };
}

function parseBoxAttrs(raw: string): Bounds | null {
  const a = attrs(raw);
  const x = Number(a.x);
  const y = Number(a.y);
  const width = Number(a.width);
  const height = Number(a.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function xmlTrue(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function fromXml(xml: string): LintModel {
  const trimmed = xml.trim();
  if (!trimmed) return emptyModel('Empty BPMN XML');
  const bodies = processBodies(trimmed);
  if (!bodies.length && !/<(?:[\w.-]+:)?definitions\b/i.test(trimmed)) {
    return emptyModel('Could not parse BPMN XML');
  }

  const nodes: LintNode[] = [];
  const seen = new Set<string>();
  const flows: LintFlow[] = [];
  const associations: LintAssociation[] = [];
  const adHocInnerIds: string[] = [];
  for (const body of bodies) {
    for (const hit of collect(body, NODE_ALT)) {
      const kind = NODE_KIND[hit.tag];
      const id = hit.attr.id;
      if (!kind || !id || seen.has(id)) continue;
      seen.add(id);
      if (hit.tag === 'adhocsubprocess') {
        for (const inner of collect(hit.inner, NODE_ALT)) {
          if (inner.attr.id) adHocInnerIds.push(inner.attr.id);
        }
      }
      const coreType =
        CORE_TYPE[hit.tag] ??
        (kind === 'start' ? 'start' : kind === 'end' ? 'end' : kind === 'gateway' ? 'exclusiveGateway' : 'task');
      const eventKind = kind === 'start' || kind === 'end' || kind === 'event';
      const eventDefinition = eventKind ? eventDefinitionFromInner(hit.inner) : undefined;
      const cancelActivity = cancelActivityFrom(hit.attr);
      nodes.push({
        id,
        name: hit.attr.name ?? '',
        kind,
        layoutType: hit.tag === 'startevent' ? 'start' : hit.tag === 'endevent' ? 'end' : CORE_TYPE[hit.tag] ?? hit.tag,
        coreType,
        bpmnType: bpmnTypeFromTag(hit.tag) ?? DEFAULT_BPMN_TYPE[coreType],
        ...(eventDefinition ? { eventDefinition } : {}),
        ...(hit.attr.attachedtoref ? { attachedTo: hit.attr.attachedtoref } : {}),
        ...(xmlTrue(hit.attr.triggeredbyevent) ? { triggeredByEvent: true } : {}),
        ...(cancelActivity === false ? { cancelActivity: false } : {}),
        ...(xmlTrue(hit.attr.isforcompensation) ? { isForCompensation: true } : {}),
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
    for (const hit of collect(body, 'association')) {
      associations.push({
        id: hit.attr.id || `assoc_${associations.length + 1}`,
        source: hit.attr.sourceref || null,
        target: hit.attr.targetref || null,
      });
    }
  }

  const { bounds, labels } = parseBoundsAndLabels(trimmed);
  return { nodes, flows, associations, adHocInnerIds, bounds, labels, hasDi: Object.keys(bounds).length > 0 };
}
