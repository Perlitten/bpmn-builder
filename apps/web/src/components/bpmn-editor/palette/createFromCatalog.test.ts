import { describe, expect, it, vi } from 'vitest';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import { pickCatalogItem } from './createFromCatalog';
import { SEQUENCE_FLOW_HINT } from './contextFilter';

function def(id: string) {
  const item = bpmnComponentRegistry.get(id);
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

describe('pickCatalogItem', () => {
  it('creates via semantic op, not click-to-place', async () => {
    const create = vi.fn(async () => true);
    const result = await pickCatalogItem(def('activity.task'), { id: 'StartEvent_1', type: 'bpmn:StartEvent' }, {
      create,
    });
    expect(create).toHaveBeenCalledWith('activity.task', 'StartEvent_1');
    expect(result).toBeUndefined();
  });

  it('creates typed tasks via the same semantic op', async () => {
    const create = vi.fn(async () => true);
    const result = await pickCatalogItem(def('activity.userTask'), { id: 'StartEvent_1', type: 'bpmn:StartEvent' }, {
      create,
    });
    expect(create).toHaveBeenCalledWith('activity.userTask', 'StartEvent_1');
    expect(result).toBeUndefined();
  });

  it('creates event-based gateways via split ops', async () => {
    const create = vi.fn(async () => true);
    await pickCatalogItem(def('gateway.eventBased'), { id: 'A', type: 'bpmn:Task' }, { create });
    expect(create).toHaveBeenCalledWith('gateway.eventBased', 'A');
  });

  it('creates implemented boundary timers via ops on an activity', async () => {
    const create = vi.fn(async () => true);
    const result = await pickCatalogItem(def('boundary.timer'), { id: 'Activity_1', type: 'bpmn:Task' }, { create });
    expect(create).toHaveBeenCalledWith('boundary.timer', 'Activity_1');
    expect(result).toBeUndefined();
  });

  it('does not start a free-form create for unimplemented types', async () => {
    const create = vi.fn(async () => true);
    const result = await pickCatalogItem(def('gateway.complex'), { id: 'A', type: 'bpmn:Task' }, { create });
    expect(create).not.toHaveBeenCalled();
    expect(result?.hint).toMatch(/not in the semantic first slice/i);
  });

  it('creates implemented gateways via split ops', async () => {
    const create = vi.fn(async () => true);
    await pickCatalogItem(def('gateway.exclusive'), { id: 'Activity_1', type: 'bpmn:Task' }, { create });
    expect(create).toHaveBeenCalledWith('gateway.exclusive', 'Activity_1');
  });

  it('creates pool, lane, and message flow via semantic ops', async () => {
    const create = vi.fn(async () => true);
    expect(await pickCatalogItem(def('participant.pool'), null, { create })).toBeUndefined();
    expect(create).toHaveBeenCalledWith('participant.pool', undefined);

    create.mockClear();
    await pickCatalogItem(def('participant.lane'), { id: 'Participant_1', type: 'bpmn:Participant' }, { create });
    expect(create).toHaveBeenCalledWith('participant.lane', 'Participant_1');

    create.mockClear();
    const result = await pickCatalogItem(def('flow.message'), null, { create });
    expect(create).toHaveBeenCalledWith('flow.message', undefined);
    expect(result).toBeUndefined();
  });

  it('hints sequence flow instead of starting global connect', async () => {
    const create = vi.fn(async () => true);
    const withSource = await pickCatalogItem(def('flow.sequence'), { id: 'Activity_1', type: 'bpmn:Task' }, { create });
    const withoutSource = await pickCatalogItem(def('flow.sequence'), null, { create });
    expect(create).not.toHaveBeenCalled();
    expect(withSource?.hint).toBe(SEQUENCE_FLOW_HINT);
    expect(withoutSource?.hint).toBe(SEQUENCE_FLOW_HINT);
  });
});
