import {
  bpmnComponentRegistry,
  type BpmnComponentDefinition,
  type BpmnComponentRegistry,
} from '@bpmn/semantic-core';
import { isBpmnType, type DiagramElement } from '../diagramElement';
import { CATEGORY_LABEL, catalogGroup, createKind, type PaletteCategoryId } from './catalogPresentation';

export type FilterContext = {
  selection: DiagramElement | null;
  hasParticipant: boolean;
  searching: boolean;
};

export type ResolvedCatalogItem = {
  item: BpmnComponentDefinition;
  enabled: boolean;
  hidden: boolean;
  reason?: string;
};

export function isSequenceFlowSource(element: DiagramElement | null): boolean {
  if (!element || !isBpmnType(element, 'bpmn:FlowNode')) return false;
  if (isBpmnType(element, 'bpmn:EndEvent')) return false;
  if (isBpmnType(element, 'bpmn:BoundaryEvent')) return false;
  if (element.businessObject?.isForCompensation) return false;
  if (element.businessObject?.triggeredByEvent) return false;
  return true;
}

export function isActivity(element: DiagramElement | null): boolean {
  return !!element && isBpmnType(element, 'bpmn:Activity') && !isBpmnType(element, 'bpmn:BoundaryEvent');
}

export function isPoolOrLane(element: DiagramElement | null): element is DiagramElement {
  return !!element && (isBpmnType(element, 'bpmn:Participant') || isBpmnType(element, 'bpmn:Lane'));
}

export const SEQUENCE_FLOW_HINT = 'Select a source, then a target in the inspector';

function contextReason(def: BpmnComponentDefinition, ctx: FilterContext): string | undefined {
  const kind = createKind(def);
  if (kind === 'attach' && !isActivity(ctx.selection)) {
    return 'Select an activity to attach a boundary event';
  }
  if (kind === 'connect-message' && !ctx.hasParticipant) {
    return 'Add a pool first — message flow is between participants';
  }
  if (kind === 'connect-sequence') {
    if (def.id === 'flow.conditional' || def.id === 'flow.default') {
      if (!ctx.selection) return 'Select a sequence flow or a source with one outgoing flow';
      return undefined;
    }
    if (ctx.selection && !isSequenceFlowSource(ctx.selection)) {
      return 'Sequence flow cannot leave this element';
    }
    return SEQUENCE_FLOW_HINT;
  }
  if (kind === 'association' || def.id === 'flow.association') {
    if (!ctx.selection) return 'Select an element to associate with a text annotation';
    return undefined;
  }
  return undefined;
}

export function resolveCatalogItem(item: BpmnComponentDefinition, ctx: FilterContext): ResolvedCatalogItem {
  if (!item.implemented) {
    return {
      item,
      enabled: false,
      hidden: false,
      reason: 'Not in modeling profile yet',
    };
  }
  const reason = contextReason(item, ctx);
  return { item, enabled: !reason, hidden: false, reason };
}

export function catalogForFlyout(
  category: PaletteCategoryId,
  query: string,
  ctx: Omit<FilterContext, 'searching'>,
  registry: BpmnComponentRegistry = bpmnComponentRegistry,
): { groups: Array<{ name: string; items: ResolvedCatalogItem[] }>; emptyHint: string } {
  const searching = query.trim().length > 0;
  const pool = searching ? registry.search(query) : registry.listByCategory(category);
  const resolved = pool
    .map((item) => resolveCatalogItem(item, { ...ctx, searching }))
    .filter((entry) => !entry.hidden);

  const order: string[] = [];
  const grouped = new Map<string, ResolvedCatalogItem[]>();
  for (const entry of resolved) {
    const name = searching ? searchGroupName(entry.item) : catalogGroup(entry.item);
    if (!grouped.has(name)) {
      grouped.set(name, []);
      order.push(name);
    }
    grouped.get(name)!.push(entry);
  }

  const emptyHint = searching ? 'No matching BPMN elements.' : 'No BPMN elements in this category.';

  return {
    groups: order.map((name) => ({ name, items: grouped.get(name)! })),
    emptyHint,
  };
}

function searchGroupName(def: BpmnComponentDefinition): string {
  return `${CATEGORY_LABEL[def.category]} · ${catalogGroup(def)}`;
}
