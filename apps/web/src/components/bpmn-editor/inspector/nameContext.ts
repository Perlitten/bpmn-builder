import type { NameContext, NameNeighbor } from '@bpmn/rules';
import type { DiagramElement } from '../diagramElement';
import { elementName, isDefaultOutgoing } from './inspectorModel';

function neighbor(el: DiagramElement | undefined): NameNeighbor | undefined {
  if (!el) return undefined;
  return { id: el.id, type: el.type, name: elementName(el) };
}

export function nameContextFromElement(element: DiagramElement): NameContext {
  const incoming = (element.incoming ?? [])
    .map((flow) => neighbor(flow.source))
    .filter((node): node is NameNeighbor => !!node);
  const outgoing = (element.outgoing ?? [])
    .map((flow) => neighbor(flow.target))
    .filter((node): node is NameNeighbor => !!node);
  const siblings = (element.source?.outgoing ?? []).filter((flow) => flow.type === 'bpmn:SequenceFlow');
  return {
    id: element.id,
    type: element.type,
    name: elementName(element),
    incoming,
    outgoing,
    source: neighbor(element.source),
    target: neighbor(element.target),
    isDefault: element.source ? isDefaultOutgoing(element.source, element) : false,
    condition: element.businessObject?.conditionExpression?.body,
    flowIndex: siblings.findIndex((flow) => flow.id === element.id),
    sourceOutgoingCount: siblings.length,
  };
}
