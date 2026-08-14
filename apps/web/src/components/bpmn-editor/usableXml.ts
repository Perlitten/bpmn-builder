import { DEFAULT_BPMN_XML } from './defaultBpmnXml';

export function hasStartEvent(xml: string): boolean {
  return /<(?:[\w.-]+:)?startEvent\b/i.test(xml);
}

export function usableXml(xml: string): string {
  return hasStartEvent(xml) ? xml : DEFAULT_BPMN_XML;
}
