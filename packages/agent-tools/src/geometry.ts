import { ToolPlanError } from './errors.js';

const GEOMETRY_KEYS = new Set([
  'x',
  'y',
  'cx',
  'cy',
  'width',
  'height',
  'waypoints',
  'waypoint',
  'bounds',
  'bpmnxml',
  'bpmndi',
  'di',
  'dc',
  'coordinates',
]);

export function looksLikeBpmnXml(value: string): boolean {
  return /<\s*(bpmn:)?definitions\b/i.test(value) || /<\s*bpmndi:/i.test(value) || /<\s*di:waypoint\b/i.test(value);
}

function walk(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (looksLikeBpmnXml(value)) {
      throw new ToolPlanError(`tool args must not include BPMN XML (${path})`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (GEOMETRY_KEYS.has(key.toLowerCase())) {
      throw new ToolPlanError(`tool args must not include coordinates or DI (${path}.${key})`);
    }
    walk(child, `${path}.${key}`);
  }
}

/** LLM / plan args may only be semantic ids and names — never DI. */
export function assertNoGeometry(args: Record<string, unknown>, toolName: string): void {
  walk(args, toolName);
}
