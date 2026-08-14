/// <reference path="./vendor.d.ts" />
import type { ExtensionValue } from '../../semantic-core/src/index.js';
import { BpmnModdle } from 'bpmn-moddle';
import { Writer } from 'moddle-xml';

const SKIP_OWN = new Set(['$instanceOf', 'get', 'set', 'hasType', '$descriptor', '$model', '$parent', '$attrs']);

export type ModdleEl = {
  $type: string;
  id?: string;
  name?: string;
  $body?: string;
  $children?: ModdleEl[];
  $descriptor?: {
    isGeneric?: boolean;
    ns?: { prefix?: string; localName?: string; uri?: string };
    properties?: Array<{
      name: string;
      isMany?: boolean;
      isAttr?: boolean;
      isBody?: boolean;
      isReference?: boolean;
    }>;
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

export function snapshotExtensions(el: ModdleEl): ExtensionValue[] | undefined {
  const ext = el.get('extensionElements') as ModdleEl | undefined;
  if (!ext) return undefined;
  const values = many(ext, 'values').map(toPlain);
  return values.length ? values : undefined;
}

export function restoreExtensions(moddle: Moddle, values: ExtensionValue[]): ModdleEl {
  return moddle.create('bpmn:ExtensionElements', { values: values.map((v) => fromPlain(moddle, v)) });
}

function toPlain(el: ModdleEl): ExtensionValue {
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
    if (prop.isReference) continue;
    const value = el.get(prop.name);
    if (value == null || value === '') continue;
    if (prop.isBody) {
      out.$body = String(value);
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

function fromPlain(moddle: Moddle, node: ExtensionValue): ModdleEl {
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
    if (Array.isArray(value) && value.every((item) => item && typeof item === 'object' && '$type' in item)) {
      nested[key] = (value as ExtensionValue[]).map((item) => fromPlain(moddle, item));
    } else if (value && typeof value === 'object' && '$type' in value) {
      nested[key] = fromPlain(moddle, value as ExtensionValue);
    } else {
      attrs[key] = value;
    }
  }

  try {
    const el = moddle.create(type, { ...attrs, ...nested });
    if (typeof body === 'string') el.set('body', body);
    return el;
  } catch {
    return moddle.createAny(type, ns?.uri ?? guessUri(type), {
      ...attrs,
      ...nested,
      ...(typeof body === 'string' ? { $body: body } : {}),
      ...(children?.length ? { $children: children.map((c) => fromPlain(moddle, c)) } : {}),
    });
  }
}

function guessUri(type: string): string {
  const prefix = type.includes(':') ? type.slice(0, type.indexOf(':')) : 'ext';
  if (prefix === 'camunda') return 'http://camunda.org/schema/1.0/bpmn';
  if (prefix === 'zeebe') return 'http://camunda.org/schema/zeebe/1.0';
  return `http://unknown/${prefix}`;
}
