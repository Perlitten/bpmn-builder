import {
  bpmnComponentRegistry,
  DEFAULT_BPMN_TYPE,
  type FlowNode,
  type FlowNodeType,
  type Process,
  type SequenceFlow,
  collectXmlElements,
  parseXmlAttributes,
  scanXmlTags,
  stripXmlComments,
  stripXmlElements,
  xmlAttr,
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
  const suffix = 'eventdefinition';
  if (!local.toLowerCase().endsWith(suffix)) return local;
  const head = local.slice(0, -suffix.length);
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

type ParsedAttrs = Record<string, string>;

function parsedAttrs(raw: string): ParsedAttrs {
  return Object.fromEntries([...parseXmlAttributes(raw)].map(([key, value]) => [`$${key}`, value]));
}

function collect(xml: string, tagAlt: string): { tag: string; attr: Record<string, string>; inner: string }[] {
  const allowed = new Set(tagAlt.split('|').map((tag) => tag.toLowerCase()));
  const found: { tag: string; attr: ParsedAttrs; inner: string }[] = [];
  for (const match of scanXmlTags(xml)) {
    if (match.closing || !allowed.has(match.localName)) continue;
    const inner = match.selfClosing ? '' : innerXml(xml, match.end, match.localName);
    found.push({ tag: match.localName, attr: parsedAttrs(match.rawAttributes), inner });
  }
  return found;
}

function innerXml(xml: string, from: number, tag: string): string {
  let depth = 1;
  for (const candidate of scanXmlTags(xml, from)) {
    if (candidate.localName !== tag.toLowerCase()) continue;
    if (candidate.closing) {
      depth -= 1;
      if (depth === 0) return xml.slice(from, candidate.start);
    } else if (!candidate.selfClosing) {
      depth += 1;
    }
  }
  return xml.slice(from);
}

function eventDefinitionFromInner(inner: string): string | undefined {
  for (const tag of scanXmlTags(inner)) {
    if (!tag.closing && tag.localName.toLowerCase().endsWith('eventdefinition')) {
      return normalizeEventDefinition(tag.localName);
    }
  }
  return undefined;
}

function cancelActivityFrom(attr: Record<string, string>): boolean | undefined {
  if (attr.$cancelactivity === 'false' || attr.$isinterrupting === 'false') return false;
  if (attr.$cancelactivity === 'true' || attr.$isinterrupting === 'true') return true;
  return undefined;
}

function processBodies(xml: string): string[] {
  const cleaned = stripXmlElements(stripXmlComments(xml), 'BPMNDiagram');
  return collectXmlElements(cleaned, 'process').map((process) => process.inner);
}

function parseBoundsAndLabels(xml: string): { bounds: Record<string, Bounds>; labels: Record<string, Bounds> } {
  const bounds = new Map<string, Bounds>();
  const labels = new Map<string, Bounds>();

  for (const shape of collectXmlElements(xml, 'BPMNShape')) {
    const id = xmlAttr(parseXmlAttributes(shape.rawAttributes), 'bpmnelement');
    if (!id) continue;
    const label = collectXmlElements(shape.inner, 'BPMNLabel')[0];
    const labelBox = label ? collectXmlElements(label.inner, 'Bounds')[0] : undefined;
    if (labelBox) {
      const b = parseBoxAttrs(labelBox.rawAttributes);
      if (b) labels.set(id, b);
    }
    const shapeBox = collectXmlElements(shape.inner, 'Bounds').find((candidate) => !label || candidate.start < label.start);
    if (shapeBox) {
      const b = parseBoxAttrs(shapeBox.rawAttributes);
      if (b) bounds.set(id, b);
    }
  }

  for (const edge of collectXmlElements(xml, 'BPMNEdge')) {
    const id = xmlAttr(parseXmlAttributes(edge.rawAttributes), 'bpmnelement');
    if (!id) continue;
    const label = collectXmlElements(edge.inner, 'BPMNLabel')[0];
    const labelBox = label ? collectXmlElements(label.inner, 'Bounds')[0] : undefined;
    if (labelBox) {
      const b = parseBoxAttrs(labelBox.rawAttributes);
      if (b) labels.set(id, b);
    }
  }

  return { bounds: Object.fromEntries(bounds), labels: Object.fromEntries(labels) };
}

function parseBoxAttrs(raw: string): Bounds | null {
  const a = parseXmlAttributes(raw);
  const x = Number(xmlAttr(a, 'x'));
  const y = Number(xmlAttr(a, 'y'));
  const width = Number(xmlAttr(a, 'width'));
  const height = Number(xmlAttr(a, 'height'));
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
      const id = hit.attr.$id;
      if (!kind || !id || seen.has(id)) continue;
      seen.add(id);
      if (hit.tag === 'adhocsubprocess') {
        for (const inner of collect(hit.inner, NODE_ALT)) {
          if (inner.attr.$id) adHocInnerIds.push(inner.attr.$id);
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
        name: hit.attr.$name ?? '',
        kind,
        layoutType: hit.tag === 'startevent' ? 'start' : hit.tag === 'endevent' ? 'end' : CORE_TYPE[hit.tag] ?? hit.tag,
        coreType,
        bpmnType: bpmnTypeFromTag(hit.tag) ?? DEFAULT_BPMN_TYPE[coreType],
        ...(eventDefinition ? { eventDefinition } : {}),
        ...(hit.attr.$attachedtoref ? { attachedTo: hit.attr.$attachedtoref } : {}),
        ...(xmlTrue(hit.attr.$triggeredbyevent) ? { triggeredByEvent: true } : {}),
        ...(cancelActivity === false ? { cancelActivity: false } : {}),
        ...(xmlTrue(hit.attr.$isforcompensation) ? { isForCompensation: true } : {}),
      });
    }
    for (const hit of collect(body, 'sequenceflow')) {
      flows.push({
        id: hit.attr.$id || `flow_${flows.length + 1}`,
        source: hit.attr.$sourceref || null,
        target: hit.attr.$targetref || null,
        name: hit.attr.$name ?? '',
      });
    }
    for (const hit of collect(body, 'association')) {
      associations.push({
        id: hit.attr.$id || `assoc_${associations.length + 1}`,
        source: hit.attr.$sourceref || null,
        target: hit.attr.$targetref || null,
      });
    }
  }

  const { bounds, labels } = parseBoundsAndLabels(trimmed);
  return { nodes, flows, associations, adHocInnerIds, bounds, labels, hasDi: Object.keys(bounds).length > 0 };
}
