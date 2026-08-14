import {
  bpmnComponentRegistry,
  type BpmnComponentDefinition,
  type EngineSupport,
  type EngineSupportLevel,
} from '../../semantic-core/src/index.js';
import type { LintModel, LintNode } from './model.js';
import type { ExecutionProfile, Finding } from './types.js';

const RANK: Record<EngineSupportLevel, number> = {
  unsupported: 0,
  partial: 1,
  supported: 2,
};

/** Resolve a catalog entry when the BPMN type (and event definition) uniquely identify it. */
export function catalogMatch(bpmnType: string, eventDefinition?: string): BpmnComponentDefinition | undefined {
  const type = bpmnType.startsWith('bpmn:') ? bpmnType : `bpmn:${bpmnType}`;
  let matches = bpmnComponentRegistry.list().filter((def) => def.bpmnType === type);
  if (eventDefinition) {
    matches = matches.filter((def) => def.eventDefinition === eventDefinition);
  }
  return matches.length === 1 ? matches[0] : undefined;
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
    const def = catalogMatch(node.bpmnType, node.eventDefinition);
    if (!def) continue;
    const level = supportLevel(def.engineSupport, profile);
    if (level === 'supported') continue;
    warnings.push(finding(def, node, level, label));
  }
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
