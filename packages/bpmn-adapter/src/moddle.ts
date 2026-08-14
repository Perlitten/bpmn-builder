/// <reference path="./vendor.d.ts" />
import type { BpmnPreserve, ExtensionValue } from '../../semantic-core/src/index.js';
import { BpmnModdle } from 'bpmn-moddle';
import { Writer } from 'moddle-xml';

const SKIP_OWN = new Set(['$instanceOf', 'get', 'set', 'hasType', '$descriptor', '$model', '$parent', '$attrs']);
const XMLNS_STD = /^(xmlns(?::(?:bpmn|bpmndi|dc|di|xsi))?)$/;

type Prop = {
  name: string;
  isMany?: boolean;
  isAttr?: boolean;
  isBody?: boolean;
  isReference?: boolean;
  isVirtual?: boolean;
  default?: unknown;
};

export type ModdleEl = {
  $type: string;
  id?: string;
  name?: string;
  $body?: string;
  $children?: ModdleEl[];
  $attrs?: Record<string, string>;
  $descriptor?: {
    isGeneric?: boolean;
    ns?: { prefix?: string; localName?: string; uri?: string };
    properties?: Prop[];
  };
  $instanceOf?: (type: string) => boolean;
  get: (name: string) => unknown;
  set: (name: string, value: unknown) => void;
};

export type Moddle = {
  fromXML: (xml: string) => Promise<{ rootElement: ModdleEl }>;
  create: (type: string, attrs?: Record<string, unknown>) => ModdleEl;
  createAny: (name: string, nsUri: string, properties?: Record<string, unknown>) => ModdleEl;
};

export type ResolveRef = (id: string) => ModdleEl | undefined;

export function createModdle(): Moddle {
  return new BpmnModdle() as unknown as Moddle;
}

export async function parseDefinitions(xml: string): Promise<ModdleEl> {
  const { rootElement } = await createModdle().fromXML(xml);
  return rootElement;
}

export function serializeDefinitions(definitions: ModdleEl): string {
  return new Writer({ format: true, preamble: true }).toXML(definitions);
}

export function idOf(ref: unknown): string {
  if (ref == null) return '';
  if (typeof ref === 'string') return ref;
  const el = ref as ModdleEl;
  if (typeof el.id === 'string') return el.id;
  const id = el.get?.('id');
  return typeof id === 'string' ? id : '';
}

export function isType(el: ModdleEl, type: string): boolean {
  return el.$instanceOf?.(type) === true || el.$type === type;
}

export function many(el: ModdleEl, name: string): ModdleEl[] {
  const value = el.get(name);
  if (Array.isArray(value)) return value as ModdleEl[];
  const created: ModdleEl[] = [];
  el.set(name, created);
  return created;
}

/** Read an isMany collection without replacing a single value with `[]`. */
export function readMany(el: ModdleEl, name: string): ModdleEl[] {
  const value = el.get(name);
  if (Array.isArray(value)) return value as ModdleEl[];
  if (value == null) return [];
  return [value as ModdleEl];
}

export function refId(ref: unknown): string {
  if (typeof ref === 'string' && ref.trim()) return ref.trim();
  const id = idOf(ref);
  if (id) return id;
  const body = (ref as ModdleEl | undefined)?.$body;
  return typeof body === 'string' ? body.trim() : '';
}

export function registerEl(registry: Map<string, ModdleEl>, el: ModdleEl): void {
  const id = idOf(el);
  if (id) registry.set(id, el);
}

export function registerTree(registry: Map<string, ModdleEl>, el: ModdleEl): void {
  registerEl(registry, el);
  for (const prop of el.$descriptor?.properties ?? []) {
    if (prop.isReference || prop.isVirtual || prop.isAttr || prop.isBody) continue;
    const value = el.get(prop.name);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && '$type' in (item as object)) registerTree(registry, item as ModdleEl);
      }
    } else if (value && typeof value === 'object' && '$type' in (value as object)) {
      registerTree(registry, value as ModdleEl);
    }
  }
}

export function resolveOf(registry: Map<string, ModdleEl>): ResolveRef {
  return (id) => registry.get(id);
}

export function snapshotExtensions(el: ModdleEl): ExtensionValue[] | undefined {
  const ext = el.get('extensionElements') as ModdleEl | undefined;
  if (!ext) return undefined;
  const values = many(ext, 'values').map((v) => toPlain(v));
  return values.length ? values : undefined;
}

export function restoreExtensions(moddle: Moddle, values: ExtensionValue[]): ModdleEl {
  return moddle.create('bpmn:ExtensionElements', { values: values.map((v) => fromPlain(moddle, v)) });
}

export function xmlnsAttrs(el: ModdleEl): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(el.$attrs ?? {})) {
    if (XMLNS_STD.test(key) || typeof value !== 'string') continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function applyXmlns(el: ModdleEl, attrs?: Record<string, string>): void {
  if (!attrs) return;
  Object.assign(el.$attrs ?? {}, attrs);
}

function isRef(value: unknown): value is { $ref: string } {
  return !!value && typeof value === 'object' && typeof (value as { $ref?: unknown }).$ref === 'string';
}

function refOf(value: unknown): { $ref: string } | undefined {
  const id = idOf(value);
  return id ? { $ref: id } : undefined;
}

export function toPlain(el: ModdleEl): ExtensionValue {
  const out: ExtensionValue = { $type: el.$type };
  const ns = el.$descriptor?.ns;
  if (ns?.uri) out.$ns = { prefix: ns.prefix, uri: ns.uri };

  if (el.$descriptor?.isGeneric) {
    for (const [key, value] of Object.entries(el)) {
      if (SKIP_OWN.has(key) || key === '$type') continue;
      if (key === '$children' && Array.isArray(value)) out.$children = (value as ModdleEl[]).map(toPlain);
      else if (key === '$body' && typeof value === 'string') out.$body = value;
      else if (!key.startsWith('$')) out[key] = value;
    }
    return out;
  }

  for (const prop of el.$descriptor?.properties ?? []) {
    if (prop.isVirtual) continue;
    const value = el.get(prop.name);
    if (value == null || value === '') continue;
    if (prop.default !== undefined && value === prop.default) continue;
    if (prop.isBody) {
      out.$body = String(value);
      continue;
    }
    if (prop.isReference) {
      if (prop.isMany) {
        const refs = (value as unknown[]).map(refOf).filter(Boolean);
        if (refs.length) out[prop.name] = refs;
      } else {
        const ref = refOf(value);
        if (ref) out[prop.name] = ref;
      }
      continue;
    }
    if (prop.isMany) {
      const items = (value as unknown[]).map((item) =>
        item && typeof item === 'object' && '$type' in (item as object) ? toPlain(item as ModdleEl) : item,
      );
      if (items.length) out[prop.name] = items;
      continue;
    }
    if (prop.isAttr || typeof value !== 'object') {
      out[prop.name] = value;
      continue;
    }
    if ('$type' in (value as object)) out[prop.name] = toPlain(value as ModdleEl);
  }
  return out;
}

function decodeValue(moddle: Moddle, value: unknown, resolve?: ResolveRef): unknown {
  if (isRef(value)) return resolve?.(value.$ref) ?? value.$ref;
  if (Array.isArray(value)) {
    if (value.every((item) => isRef(item))) return value.map((item) => decodeValue(moddle, item, resolve));
    if (value.every((item) => item && typeof item === 'object' && '$type' in item)) {
      return (value as ExtensionValue[]).map((item) => fromPlain(moddle, item, resolve));
    }
    return value;
  }
  if (value && typeof value === 'object' && '$type' in value) return fromPlain(moddle, value as ExtensionValue, resolve);
  return value;
}

export function fromPlain(moddle: Moddle, node: ExtensionValue, resolve?: ResolveRef): ModdleEl {
  const type = String(node.$type ?? 'Element');
  const ns = node.$ns;
  const rest: Record<string, unknown> = { ...node };
  delete rest.$type;
  delete rest.$ns;
  const body = rest.$body;
  const children = rest.$children as ExtensionValue[] | undefined;
  delete rest.$body;
  delete rest.$children;

  const attrs: Record<string, unknown> = {};
  const nested: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    const decoded = decodeValue(moddle, value, resolve);
    if (Array.isArray(decoded) || (decoded && typeof decoded === 'object' && !isRef(value) && '$type' in (value as object))) {
      nested[key] = decoded;
    } else {
      attrs[key] = decoded;
    }
  }

  try {
    const el = moddle.create(type, { ...attrs, ...nested });
    if (typeof body === 'string') {
      const bodyProp = el.$descriptor?.properties?.find((p) => p.isBody)?.name ?? 'body';
      el.set(bodyProp, body);
    }
    return el;
  } catch {
    return moddle.createAny(type, ns?.uri ?? guessUri(type), {
      ...attrs,
      ...nested,
      ...(typeof body === 'string' ? { $body: body } : {}),
      ...(children?.length ? { $children: children.map((c) => fromPlain(moddle, c, resolve)) } : {}),
    });
  }
}

export function snapshotPreserve(el: ModdleEl, skip: Set<string>): BpmnPreserve | undefined {
  const attrs: Record<string, unknown> = {};
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(el.$attrs ?? {})) {
    if (XMLNS_STD.test(key) || key.startsWith('xmlns') || skip.has(key)) continue;
    attrs[key] = value;
  }
  for (const prop of el.$descriptor?.properties ?? []) {
    if (prop.isVirtual || skip.has(prop.name)) continue;
    const value = el.get(prop.name);
    if (value == null || value === '') continue;
    if (prop.default !== undefined && value === prop.default) continue;
    if (prop.isBody) {
      props.$body = String(value);
      continue;
    }
    if (prop.isReference) {
      const stored = prop.isMany
        ? (value as unknown[]).map(refOf).filter(Boolean)
        : refOf(value);
      if (stored && (!Array.isArray(stored) || stored.length)) {
        (prop.isAttr ? attrs : props)[prop.name] = stored;
      }
      continue;
    }
    if (prop.isMany) {
      const items = (value as unknown[]).map((item) =>
        item && typeof item === 'object' && '$type' in (item as object) ? toPlain(item as ModdleEl) : item,
      );
      if (items.length) props[prop.name] = items;
      continue;
    }
    if (prop.isAttr || typeof value !== 'object') {
      if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
        attrs[prop.name] = value;
      } else {
        props[prop.name] = value;
      }
      continue;
    }
    if ('$type' in (value as object)) props[prop.name] = toPlain(value as ModdleEl);
  }
  const out: BpmnPreserve = {};
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (Object.keys(props).length) out.props = props;
  return out.attrs || out.props ? out : undefined;
}

export function applyPreserve(moddle: Moddle, el: ModdleEl, preserve: BpmnPreserve | undefined, resolve?: ResolveRef): void {
  if (!preserve) return;
  for (const [key, value] of Object.entries(preserve.attrs ?? {})) {
    const decoded = decodeValue(moddle, value, resolve);
    const prop = el.$descriptor?.properties?.find((p) => p.name === key);
    if (prop) el.set(key, decoded);
    else if (el.$attrs && decoded != null && decoded !== '' && !Array.isArray(decoded)) {
      el.$attrs[key] = String(decoded);
    }
  }
  for (const [key, value] of Object.entries(preserve.props ?? {})) {
    if (key === 'flowExtras' || key === '$body') continue;
    el.set(key, decodeValue(moddle, value, resolve));
  }
  const body = preserve.props?.$body;
  if (typeof body === 'string') {
    const bodyProp = el.$descriptor?.properties?.find((p) => p.isBody)?.name ?? 'body';
    el.set(bodyProp, body);
  }
}

export const ARTIFACT_TYPES = new Set(['bpmn:TextAnnotation', 'bpmn:Association', 'bpmn:Group']);

export function isArtifactType(type: string): boolean {
  return ARTIFACT_TYPES.has(type) || type.endsWith(':TextAnnotation') || type.endsWith(':Association') || type.endsWith(':Group');
}

export function appendExtras(
  moddle: Moddle,
  container: ModdleEl,
  extras: ExtensionValue[] | undefined,
  resolve: ResolveRef,
  registry: Map<string, ModdleEl>,
): void {
  if (!extras?.length) return;
  const flow = many(container, 'flowElements');
  const arts = many(container, 'artifacts');
  const assocLast = (item: ExtensionValue) => (String(item.$type).endsWith(':Association') ? 1 : 0);
  const ordered = [...extras].sort((a, b) => assocLast(a) - assocLast(b));
  for (const item of ordered) {
    const el = fromPlain(moddle, item, resolve);
    registerTree(registry, el);
    if (isArtifactType(String(item.$type))) arts.push(el);
    else flow.push(el);
  }
}

function guessUri(type: string): string {
  const prefix = type.includes(':') ? type.slice(0, type.indexOf(':')) : 'ext';
  if (prefix === 'camunda') return 'http://camunda.org/schema/1.0/bpmn';
  if (prefix === 'zeebe') return 'http://camunda.org/schema/zeebe/1.0';
  return `http://unknown/${prefix}`;
}
