import { describe, expect, it } from 'vitest';
import { bpmnComponentRegistry, CATEGORIES } from '@bpmn/semantic-core';
import { catalogForFlyout, isSequenceFlowSource, resolveCatalogItem } from './contextFilter';
import { PALETTE_CATEGORIES } from './catalogPresentation';

const task = { id: 'Activity_1', type: 'bpmn:Task' };
const end = { id: 'EndEvent_1', type: 'bpmn:EndEvent' };

function def(id: string) {
  const item = bpmnComponentRegistry.get(id);
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

describe('modeling catalog', () => {
  it('uses the kernel registry as the only vocabulary', () => {
    expect(PALETTE_CATEGORIES.map((category) => category.id)).toEqual([...CATEGORIES]);
    const ids = new Set(bpmnComponentRegistry.list().map((item) => item.category));
    expect([...ids]).toEqual([...CATEGORIES]);
    expect(bpmnComponentRegistry.get('start.none')).toBeDefined();
    expect(bpmnComponentRegistry.get('event.start.none')).toBeUndefined();
  });

  it('keeps unimplemented elements findable in registry search', () => {
    const hits = bpmnComponentRegistry.search('transaction');
    const transaction = hits.find((item) => item.id === 'activity.transaction');
    expect(transaction).toBeDefined();
    const resolved = resolveCatalogItem(transaction!, {
      selection: null,
      hasParticipant: false,
      searching: true,
    });
    expect(resolved.enabled).toBe(false);
    expect(resolved.reason).toMatch(/modeling profile/i);
  });

  it('searches semanticMeaning and agentHints, not a second keyword list', () => {
    const { groups } = catalogForFlyout('events', 'timeout during activity', {
      selection: null,
      hasParticipant: false,
    });
    expect(groups.flatMap((group) => group.items).some((entry) => entry.item.id === 'boundary.timer')).toBe(true);
  });

  it('enables typed tasks that the kernel can create', () => {
    const item = def('activity.userTask');
    expect(item.implemented).toBe(true);
    expect(resolveCatalogItem(item, { selection: null, hasParticipant: false, searching: false }).enabled).toBe(
      true,
    );
  });

  it('enables kernel-implemented gateways in the first slice', () => {
    const xor = def('gateway.exclusive');
    expect(xor.implemented).toBe(true);
    expect(resolveCatalogItem(xor, { selection: null, hasParticipant: false, searching: false }).enabled).toBe(true);

    const eventBased = def('gateway.eventBased');
    expect(eventBased.implemented).toBe(true);
    expect(
      resolveCatalogItem(eventBased, { selection: null, hasParticipant: false, searching: false }).enabled,
    ).toBe(true);
  });
});

describe('context filter', () => {
  it('lists unimplemented items in the category flyout, disabled', () => {
    const idle = catalogForFlyout('activities', '', { selection: null, hasParticipant: false });
    const items = idle.groups.flatMap((group) => group.items);
    expect(items.some((entry) => entry.item.id === 'activity.task')).toBe(true);
    const transaction = items.find((entry) => entry.item.id === 'activity.transaction');
    expect(transaction?.enabled).toBe(false);
    expect(transaction?.reason).toMatch(/modeling profile/i);
  });

  it('lists Data and Artifacts disabled; Pool is creatable', () => {
    for (const category of ['data', 'artifacts'] as const) {
      const idle = catalogForFlyout(category, '', { selection: null, hasParticipant: false });
      const items = idle.groups.flatMap((group) => group.items);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((entry) => !entry.enabled)).toBe(true);
      expect(items.every((entry) => /modeling profile/i.test(entry.reason ?? ''))).toBe(true);
    }
    const idle = catalogForFlyout('participants', '', { selection: null, hasParticipant: false });
    const items = idle.groups.flatMap((group) => group.items);
    expect(items.find((entry) => entry.item.id === 'participant.pool')?.enabled).toBe(true);
    const lane = items.find((entry) => entry.item.id === 'participant.lane');
    expect(lane?.enabled).toBe(true);
  });

  it('does not treat an end event as a continue source', () => {
    expect(isSequenceFlowSource(end)).toBe(false);
    expect(isSequenceFlowSource(task)).toBe(true);
  });

  it('enables lane without a pool so create wraps a host pool', () => {
    const lane = def('participant.lane');
    expect(lane.implemented).toBe(true);
    const resolved = resolveCatalogItem(lane, {
      selection: task,
      hasParticipant: false,
      searching: true,
    });
    expect(resolved.enabled).toBe(true);
    const idle = resolveCatalogItem(lane, {
      selection: null,
      hasParticipant: false,
      searching: false,
    });
    expect(idle.enabled).toBe(true);
    const onPool = resolveCatalogItem(lane, {
      selection: { id: 'Participant_1', type: 'bpmn:Participant' },
      hasParticipant: true,
      searching: false,
    });
    expect(onPool.enabled).toBe(true);
  });

  it('enables message flow once a pool exists', () => {
    const item = def('flow.message');
    expect(item.implemented).toBe(true);
    const idle = resolveCatalogItem(item, { selection: null, hasParticipant: false, searching: false });
    expect(idle.enabled).toBe(false);
    expect(idle.reason).toMatch(/pool first/i);
    expect(
      resolveCatalogItem(item, { selection: null, hasParticipant: true, searching: false }).enabled,
    ).toBe(true);
  });

  it('disables sequence flow instead of starting global connect', () => {
    const item = def('flow.sequence');
    const idle = resolveCatalogItem(item, { selection: null, hasParticipant: false, searching: false });
    expect(idle.enabled).toBe(false);
    expect(idle.reason).toMatch(/Select a source, then a target in the inspector/);

    const fromTask = resolveCatalogItem(item, { selection: task, hasParticipant: false, searching: false });
    expect(fromTask.enabled).toBe(false);
    expect(fromTask.reason).toMatch(/Select a source, then a target in the inspector/);

    const fromEnd = resolveCatalogItem(item, { selection: end, hasParticipant: false, searching: false });
    expect(fromEnd.enabled).toBe(false);
    expect(fromEnd.reason).toMatch(/cannot leave this element/i);
  });
});
