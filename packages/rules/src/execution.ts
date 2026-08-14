import {
  bpmnComponentRegistry,
  type BpmnComponentDefinition,
  type EngineSupport,
  type EngineSupportLevel,
} from '../../semantic-core/src/index.js';
import { normalizeEventDefinition, type LintModel, type LintNode } from './model.js';
import type { ExecutionProfile, Finding } from './types.js';

const RANK: Record<EngineSupportLevel, number> = {
  unsupported: 0,
  partial: 1,
  supported: 2,
};

export type CatalogHint = {
  triggeredByEvent?: boolean;
  cancelActivity?: boolean;
};

/** Resolve a catalog entry when the BPMN type (and event definition) uniquely identify it. */
export function catalogMatch(
  bpmnType: string,
  eventDefinition?: string,
  hint: CatalogHint = {},
): BpmnComponentDefinition | undefined {
  const matches = catalogCandidates(bpmnType, eventDefinition, hint);
  if (matches.length === 1) return matches[0];
  if (matches.length < 2) return undefined;
  if (!sameEngineSupport(matches)) return undefined;
  return canonical(matches);
}

function catalogCandidates(bpmnType: string, eventDefinition: string | undefined, hint: CatalogHint): BpmnComponentDefinition[] {
  const type = bpmnType.startsWith('bpmn:') ? bpmnType : `bpmn:${bpmnType}`;
  let matches = bpmnComponentRegistry.list().filter((def) => def.bpmnType === type);
  const eventDef = normalizeEventDefinition(eventDefinition);
  if (eventDef) {
    matches = matches.filter((def) => normalizeEventDefinition(def.eventDefinition) === eventDef);
  }
  if (type === 'bpmn:SubProcess' && hint.triggeredByEvent !== undefined) {
    matches = matches.filter((def) =>
      hint.triggeredByEvent ? def.id === 'activity.eventSubProcess' : def.id === 'activity.subProcess',
    );
  }
  if (hint.cancelActivity !== undefined) {
    const nonInt = hint.cancelActivity === false;
    const narrowed = matches.filter((def) => def.id.endsWith('.nonInterrupting') === nonInt);
    if (narrowed.length) matches = narrowed;
  }
  return matches;
}

function sameEngineSupport(defs: BpmnComponentDefinition[]): boolean {
  const key = (def: BpmnComponentDefinition) => `${def.engineSupport.camunda8}:${def.engineSupport.zeebe}`;
  return defs.every((def) => key(def) === key(defs[0]!));
}

function canonical(defs: BpmnComponentDefinition[]): BpmnComponentDefinition {
  return (
    defs.find((def) => def.id === 'activity.subProcess') ??
    defs.find((def) => !def.id.endsWith('.nonInterrupting')) ??
    defs[0]!
  );
}

export function supportLevel(support: EngineSupport, profile: 'camunda8' | 'zeebe'): EngineSupportLevel {
  if (profile === 'zeebe') return support.zeebe;
  return RANK[support.camunda8] <= RANK[support.zeebe] ? support.camunda8 : support.zeebe;
}

export function engineLabel(profile: 'camunda8' | 'zeebe'): string {
  return profile === 'zeebe' ? 'Zeebe' : 'Camunda 8 / Zeebe';
}

export function executionScore(findings: Finding[]): number {
  const penalty = findings
    .filter((f) => f.layer === 2)
    .reduce((n, f) => n + (f.id === 'execution.partial' ? 15 : 25), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

/** Layer 2: Camunda 8 / Zeebe subset via registry `engineSupport`. Neutral has no engine flags. */
export function layerExecution(model: LintModel, profile: ExecutionProfile, warnings: Finding[]): void {
  if (profile === 'neutral') return;
  const label = engineLabel(profile);
  for (const node of model.nodes) {
    if (!node.bpmnType) continue;
    if (unmodeledEvent(node)) continue;
    const def = catalogMatch(node.bpmnType, node.eventDefinition, {
      triggeredByEvent: node.triggeredByEvent,
      cancelActivity: node.cancelActivity,
    });
    if (!def) continue;
    const level = supportLevel(def.engineSupport, profile);
    if (level === 'supported') continue;
    warnings.push(finding(def, node, level, label));
  }
}

function unmodeledEvent(node: LintNode): boolean {
  const def = node.eventDefinition ?? '';
  return def === 'LinkEventDefinition' || def === 'CompensateEventDefinition';
}

function finding(
  def: BpmnComponentDefinition,
  node: LintNode,
  level: 'unsupported' | 'partial',
  engine: string,
): Finding {
  const name = node.name.trim();
  const who = name ? `“${name}”` : node.id;
  const partial = level === 'partial';
  return {
    id: partial ? 'execution.partial' : 'execution.unsupported',
    layer: 2,
    severity: 'warning',
    message: partial
      ? `${def.title} ${who} is only partially supported on ${engine}`
      : `${def.title} ${who} is not supported on ${engine}`,
    elementId: node.id,
  };
}
