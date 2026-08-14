import { describe, expect, it } from 'vitest';
import { IMPLEMENTED_COMPONENT_IDS } from './define.js';
import {
  BpmnComponentRegistry,
  bpmnComponentRegistry,
  canCreate,
  get,
  listByCategory,
  search,
} from './index.js';
import { CATEGORIES } from './types.js';

describe('BpmnComponentRegistry', () => {
  it('search "timeout" finds boundary.timer', () => {
    const hits = search('timeout');
    expect(hits.some((c) => c.id === 'boundary.timer')).toBe(true);
    const timer = get('boundary.timer');
    expect(timer?.eventDefinition).toBe('TimerEventDefinition');
    expect(timer?.layoutBehavior).toEqual({ placement: 'attachToActivityBoundary', exceptionBranch: true });
    expect(timer?.implemented).toBe(true);
    expect(timer?.semanticMeaning).toMatch(/activity is active/i);
  });

  it('cancel end canCreate is false outside a transaction', () => {
    expect(canCreate('end.cancel', { parentBpmnType: 'bpmn:Process' })).toBe(false);
    expect(canCreate('end.cancel', {})).toBe(false);
    expect(canCreate('end.cancel', { parentBpmnType: 'bpmn:SubProcess' })).toBe(false);
    expect(canCreate('end.cancel', { parentBpmnType: 'bpmn:Transaction', inTransaction: true })).toBe(true);
  });

  it('space-tool is not a component', () => {
    expect(get('space-tool')).toBeUndefined();
    expect(get('hand-tool')).toBeUndefined();
    expect(get('lasso-tool')).toBeUndefined();
    expect(bpmnComponentRegistry.list().some((c) => /space-tool|spaceTool/i.test(c.id))).toBe(false);
    expect(search('space-tool')).toEqual([]);
  });

  it('rejects deleted web palette aliases', () => {
    expect(get('event.start.none')).toBeUndefined();
    expect(get('event.end.none')).toBeUndefined();
    expect(get('event.boundary.timer')).toBeUndefined();
    expect(get('event.boundary.error')).toBeUndefined();
  });

  it('implemented is only the kernel first slice', () => {
    const ids = bpmnComponentRegistry
      .list()
      .filter((c) => c.implemented)
      .map((c) => c.id)
      .sort();
    expect(ids).toEqual([...IMPLEMENTED_COMPONENT_IDS].sort());
  });

  it('listByCategory covers every catalog group', () => {
    const grouped = listByCategory();
    expect(Object.keys(grouped).sort()).toEqual([...CATEGORIES].sort());
    expect(listByCategory('events').length).toBeGreaterThan(20);
    expect(listByCategory('activities').some((c) => c.id === 'activity.userTask')).toBe(true);
    expect(listByCategory('gateways').map((c) => c.id)).toEqual([
      'gateway.exclusive',
      'gateway.parallel',
      'gateway.inclusive',
      'gateway.complex',
      'gateway.eventBased',
    ]);
    expect(listByCategory('flows').map((c) => c.id)).toContain('flow.message');
    expect(listByCategory('participants').map((c) => c.id)).toEqual(['participant.pool', 'participant.lane']);
    expect(listByCategory('data').map((c) => c.id)).toEqual(['data.object', 'data.store']);
    expect(listByCategory('artifacts').map((c) => c.id)).toEqual(['artifact.group', 'artifact.textAnnotation']);
  });

  it('search matches title, meaning, and agentHints', () => {
    expect(search('User Task').some((c) => c.id === 'activity.userTask')).toBe(true);
    expect(search('competing future events').some((c) => c.id === 'gateway.eventBased')).toBe(true);
    expect(search('SLA expiration').some((c) => c.id === 'boundary.timer')).toBe(true);
  });

  it('first-slice types canCreate in a process; unknown id cannot', () => {
    expect(canCreate('start.none', {})).toBe(true);
    expect(canCreate('end.none', {})).toBe(true);
    expect(canCreate('activity.task', {})).toBe(true);
    expect(canCreate('activity.subProcess', {})).toBe(true);
    expect(canCreate('activity.eventSubProcess', {})).toBe(true);
    expect(canCreate('activity.userTask', {})).toBe(true);
    expect(canCreate('gateway.exclusive', {})).toBe(true);
    expect(canCreate('flow.sequence', {})).toBe(true);
    expect(canCreate('participant.pool', {})).toBe(true);
    expect(canCreate('participant.lane', {})).toBe(true);
    expect(canCreate('flow.message', {})).toBe(false);
    expect(canCreate('start.none', { inEventSubProcess: true })).toBe(false);
    expect(canCreate('no-such-component', {})).toBe(false);
  });

  it('boundary.timer attaches to activities, not events', () => {
    const def = get('boundary.timer');
    expect(def?.canAttach({ attachToBpmnType: 'bpmn:UserTask' })).toBe(true);
    expect(def?.canAttach({ attachToBpmnType: 'bpmn:StartEvent' })).toBe(false);
    expect(def?.canAttach({})).toBe(false);
    expect(get('boundary.error')?.implemented).toBe(true);
    expect(get('boundary.error')?.canAttach({ attachToBpmnType: 'bpmn:ServiceTask' })).toBe(true);
    expect(get('intermediate.catch.timer')?.implemented).toBe(true);
    expect(get('end.terminate')?.implemented).toBe(true);
    expect(get('start.message')?.implemented).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const a = get('start.none')!;
    expect(() => new BpmnComponentRegistry([a, { ...a }])).toThrow(/duplicate component id/);
  });
});
