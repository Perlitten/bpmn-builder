import { BPMN_COMPONENT_CATALOG } from './catalog.js';
import {
  CATEGORIES,
  type BpmnComponentCategory,
  type BpmnComponentDefinition,
  type ComponentContext,
  type ReplaceTarget,
} from './types.js';

export class BpmnComponentRegistry {
  private readonly byId = new Map<string, BpmnComponentDefinition>();

  constructor(private readonly definitions: readonly BpmnComponentDefinition[] = BPMN_COMPONENT_CATALOG) {
    for (const def of definitions) {
      if (this.byId.has(def.id)) throw new Error(`duplicate component id: ${def.id}`);
      this.byId.set(def.id, def);
    }
  }

  get(id: string): BpmnComponentDefinition | undefined {
    return this.byId.get(id);
  }

  list(): readonly BpmnComponentDefinition[] {
    return this.definitions;
  }

  listByCategory(): Record<BpmnComponentCategory, BpmnComponentDefinition[]>;
  listByCategory(category: BpmnComponentCategory): BpmnComponentDefinition[];
  listByCategory(
    category?: BpmnComponentCategory,
  ): Record<BpmnComponentCategory, BpmnComponentDefinition[]> | BpmnComponentDefinition[] {
    if (category) return this.definitions.filter((d) => d.category === category);
    const grouped = Object.fromEntries(CATEGORIES.map((c) => [c, [] as BpmnComponentDefinition[]])) as Record<
      BpmnComponentCategory,
      BpmnComponentDefinition[]
    >;
    for (const def of this.definitions) grouped[def.category].push(def);
    return grouped;
  }

  search(query: string): BpmnComponentDefinition[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.definitions.filter((def) => haystack(def).includes(q));
  }

  canCreate(id: string, context: ComponentContext = {}): boolean {
    return this.get(id)?.canCreate(context) ?? false;
  }

  canReplace(id: string, element: ReplaceTarget): boolean {
    return this.get(id)?.canReplace(element) ?? false;
  }

  replacementsFor(element: ReplaceTarget): BpmnComponentDefinition[] {
    return this.definitions.filter((def) => def.canReplace(element));
  }
}

function haystack(def: BpmnComponentDefinition): string {
  return [
    def.id,
    def.title,
    def.bpmnType,
    def.eventDefinition ?? '',
    def.semanticMeaning,
    ...def.agentHints.useFor,
    ...def.agentHints.doNotUseFor,
  ]
    .join(' ')
    .toLowerCase();
}

export const bpmnComponentRegistry = new BpmnComponentRegistry();

export function get(id: string): BpmnComponentDefinition | undefined {
  return bpmnComponentRegistry.get(id);
}

export function listByCategory(): Record<BpmnComponentCategory, BpmnComponentDefinition[]>;
export function listByCategory(category: BpmnComponentCategory): BpmnComponentDefinition[];
export function listByCategory(
  category?: BpmnComponentCategory,
): Record<BpmnComponentCategory, BpmnComponentDefinition[]> | BpmnComponentDefinition[] {
  return category ? bpmnComponentRegistry.listByCategory(category) : bpmnComponentRegistry.listByCategory();
}

export function search(query: string): BpmnComponentDefinition[] {
  return bpmnComponentRegistry.search(query);
}

export function canCreate(id: string, context: ComponentContext = {}): boolean {
  return bpmnComponentRegistry.canCreate(id, context);
}

export { BPMN_COMPONENT_CATALOG } from './catalog.js';
export { BPMN, IMPLEMENTED_COMPONENT_IDS } from './define.js';
export { CATEGORIES } from './types.js';
export type {
  AgentHints,
  BpmnComponentCategory,
  BpmnComponentDefinition,
  ComponentContext,
  EngineSupport,
  EngineSupportLevel,
  EventDefinitionName,
  LayoutBehavior,
  LayoutPlacement,
  ReplaceTarget,
} from './types.js';
