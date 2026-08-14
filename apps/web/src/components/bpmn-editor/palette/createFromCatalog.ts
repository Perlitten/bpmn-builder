import { type BpmnComponentDefinition } from '@bpmn/semantic-core';
import type { DiagramElement } from '../diagramElement';
import { isActivity, isPoolOrLane, isSequenceFlowSource, SEQUENCE_FLOW_HINT } from './contextFilter';
import { createKind } from './catalogPresentation';

export type SemanticCreate = {
  create: (catalogId: string, afterId?: string) => Promise<boolean>;
};

export type PickResult = { hint?: string };

export async function pickCatalogItem(
  item: BpmnComponentDefinition,
  source: DiagramElement | null,
  semantic: SemanticCreate,
): Promise<PickResult | undefined> {
  if (!item.implemented) {
    return { hint: `${item.title} is not in the semantic first slice yet` };
  }

  const kind = createKind(item);
  if (kind === 'connect-sequence') {
    if (item.id === 'flow.conditional' || item.id === 'flow.default') {
      if (!source) {
        return { hint: 'Select a sequence flow or a source with one outgoing flow' };
      }
      try {
        const applied = await semantic.create(item.id, source.id);
        if (applied) return undefined;
      } catch (err) {
        return { hint: err instanceof Error ? err.message : String(err) };
      }
      return { hint: `${item.title} is not in the semantic first slice yet` };
    }
    return { hint: SEQUENCE_FLOW_HINT };
  }

  if (kind === 'attach') {
    if (!source || !isActivity(source)) {
      return { hint: 'Select an activity to attach a boundary event' };
    }
    try {
      const applied = await semantic.create(item.id, source.id);
      if (applied) return undefined;
    } catch (err) {
      return { hint: err instanceof Error ? err.message : String(err) };
    }
    return { hint: `${item.title} is not in the semantic first slice yet` };
  }

  if (kind === 'association') {
    if (!source) {
      return { hint: 'Select an element to associate with a text annotation' };
    }
    try {
      const applied = await semantic.create(item.id, source.id);
      if (applied) return undefined;
    } catch (err) {
      return { hint: err instanceof Error ? err.message : String(err) };
    }
    return { hint: `${item.title} is not in the semantic first slice yet` };
  }

  try {
    let afterId: string | undefined;
    if (kind === 'lane') afterId = isPoolOrLane(source) ? source.id : undefined;
    else if (kind === 'connect-message' || kind === 'participant') afterId = source?.id;
    else if (source && isSequenceFlowSource(source)) afterId = source.id;
    else if (source?.type === 'bpmn:Lane' && item.canCreate({ parentBpmnType: 'bpmn:Lane' })) {
      afterId = source.id;
    }
    const applied = await semantic.create(item.id, afterId);
    if (applied) return undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/no semantic create op/i.test(message) || /unknown component/i.test(message)) {
      return { hint: `${item.title} is not in the semantic first slice yet` };
    }
    return { hint: message };
  }
  return { hint: `${item.title} is not in the semantic first slice yet` };
}
