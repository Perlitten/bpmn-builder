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

  it('creates compensation boundary events through the semantic op', async () => {
    const create = vi.fn(async () => true);
    const result = await pickCatalogItem(def('boundary.compensation'), { id: 'A', type: 'bpmn:Task' }, { create });
    expect(create).toHaveBeenCalledWith('boundary.compensation', 'A');
    expect(result).toBeUndefined();
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
    await pickCatalogItem(def('participant.lane'), { id: 'Activity_1', type: 'bpmn:Task' }, { create });
    expect(create).toHaveBeenCalledWith('participant.lane', undefined);

    create.mockClear();
    await pickCatalogItem(def('participant.lane'), null, { create });
    expect(create).toHaveBeenCalledWith('participant.lane', undefined);

    create.mockClear();
    const result = await pickCatalogItem(def('flow.message'), null, { create });
    expect(create).toHaveBeenCalledWith('flow.message', undefined);
    expect(result).toBeUndefined();
  });

  it('creates a task into a selected lane when canCreate allows a lane parent', async () => {
    const create = vi.fn(async () => true);
    const lane = { id: 'Lane_1', type: 'bpmn:Lane' };
    await pickCatalogItem(def('activity.task'), lane, { create });
    expect(create).toHaveBeenCalledWith('activity.task', 'Lane_1');

    create.mockClear();
    await pickCatalogItem(def('activity.userTask'), lane, { create });
    expect(create).toHaveBeenCalledWith('activity.userTask', 'Lane_1');

    create.mockClear();
    await pickCatalogItem(def('participant.lane'), lane, { create });
    expect(create).toHaveBeenCalledWith('participant.lane', 'Lane_1');
  });

  it('keeps boundary events disabled without an activity host', async () => {
    const create = vi.fn(async () => true);
    const result = await pickCatalogItem(def('boundary.compensation'), { id: 'Lane_1', type: 'bpmn:Lane' }, { create });
    expect(create).not.toHaveBeenCalled();
    expect(result?.hint).toMatch(/activity to attach/i);
  });

  it('creates conditional / default flow via setFlowKind, not global connect', async () => {
    const create = vi.fn(async () => true);
    const fromTask = await pickCatalogItem(def('flow.conditional'), { id: 'Activity_1', type: 'bpmn:Task' }, { create });
    expect(create).toHaveBeenCalledWith('flow.conditional', 'Activity_1');
    expect(fromTask).toBeUndefined();

    create.mockClear();
    const fromFlow = await pickCatalogItem(def('flow.default'), { id: 'SequenceFlow_1', type: 'bpmn:SequenceFlow' }, {
      create,
    });
    expect(create).toHaveBeenCalledWith('flow.default', 'SequenceFlow_1');
    expect(fromFlow).toBeUndefined();

    create.mockClear();
    const idle = await pickCatalogItem(def('flow.conditional'), null, { create });
    expect(create).not.toHaveBeenCalled();
    expect(idle?.hint).toMatch(/sequence flow or a source/i);
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
