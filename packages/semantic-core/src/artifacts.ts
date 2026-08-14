import { rebuildStructure } from './detect.js';
import { nextId } from './ids.js';
import type { Applied, ExtensionValue, Process } from './types.js';

function apply(prev: Process, fn: (draft: Process) => string): Applied {
  const draft = structuredClone(prev);
  const id = fn(draft);
  rebuildStructure(draft);
  return { process: draft, inverse: () => structuredClone(prev), id };
}

function extras(draft: Process): ExtensionValue[] {
  if (!draft.artifacts) draft.artifacts = [];
  return draft.artifacts;
}

function artifactId(item: ExtensionValue): string | undefined {
  return typeof item.id === 'string' ? item.id : undefined;
}

function isAnnotation(item: ExtensionValue): boolean {
  return String(item.$type).endsWith(':TextAnnotation');
}

export function addDataObject(process: Process, spec: { name?: string; id?: string } = {}): Applied {
  return apply(process, (draft) => {
    const id = nextId(draft, 'DataObjectReference', spec.id);
    extras(draft).push({ $type: 'bpmn:DataObjectReference', id, ...(spec.name ? { name: spec.name } : {}) });
    return id;
  });
}

export function addDataStore(process: Process, spec: { name?: string; id?: string } = {}): Applied {
  return apply(process, (draft) => {
    const id = nextId(draft, 'DataStoreReference', spec.id);
    extras(draft).push({ $type: 'bpmn:DataStoreReference', id, ...(spec.name ? { name: spec.name } : {}) });
    return id;
  });
}

export function addTextAnnotation(process: Process, spec: { text?: string; id?: string; associateTo?: string } = {}): Applied {
  return apply(process, (draft) => {
    const id = nextId(draft, 'TextAnnotation', spec.id);
    const text = spec.text ?? '';
    extras(draft).push({ $type: 'bpmn:TextAnnotation', id, text });
    if (spec.associateTo) {
      const assocId = nextId(draft, 'Association');
      extras(draft).push({
        $type: 'bpmn:Association',
        id: assocId,
        sourceRef: { $ref: spec.associateTo },
        targetRef: { $ref: id },
      });
    }
    return id;
  });
}

export function addGroup(process: Process, spec: { name?: string; id?: string } = {}): Applied {
  return apply(process, (draft) => {
    const id = nextId(draft, 'Group', spec.id);
    extras(draft).push({ $type: 'bpmn:Group', id, ...(spec.name ? { name: spec.name } : {}) });
    return id;
  });
}

export function addAssociation(process: Process, spec: { from: string; to: string }): Applied {
  if (spec.from === spec.to) throw new Error('Association needs two different elements');
  return apply(process, (draft) => {
    const id = nextId(draft, 'Association');
    extras(draft).push({
      $type: 'bpmn:Association',
      id,
      sourceRef: { $ref: spec.from },
      targetRef: { $ref: spec.to },
    });
    return id;
  });
}

export function resolveAssociationEnds(
  process: Process,
  spec: { from?: string; to?: string; after?: string },
): { from: string; to: string } {
  const from = spec.from ?? spec.after;
  const to = spec.to;
  if (from && to && from !== to) return { from, to };
  const notes = (process.artifacts ?? []).filter(isAnnotation).map(artifactId).filter((id): id is string => !!id);
  if (from && !to) {
    if (notes.includes(from)) throw new Error('Association needs a target element');
    if (notes.length === 1) return { from: notes[0]!, to: from };
    throw new Error('Association needs a text annotation and a target. Add an annotation first.');
  }
  throw new Error('Association needs a text annotation and a target. Add an annotation first.');
}
