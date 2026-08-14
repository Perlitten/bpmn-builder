import { describe, expect, it } from 'vitest';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import { CATEGORY_LABEL, PALETTE_CATEGORIES, iconClassFor } from './catalogPresentation';

function def(id: string) {
  const item = bpmnComponentRegistry.get(id);
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

describe('catalogPresentation', () => {
  it('labels rail categories with spec names, including Participants', () => {
    expect(PALETTE_CATEGORIES.map((category) => category.label)).toEqual([
      'Events',
      'Activities',
      'Gateways',
      'Flows',
      'Participants',
      'Data',
      'Artifacts',
    ]);
    expect(CATEGORY_LABEL.participants).toBe('Participants');
  });

  it('maps registry defs to bpmn-font classes without a second catalog', () => {
    expect(iconClassFor(def('start.none'))).toBe('bpmn-icon-start-event-none');
    expect(iconClassFor(def('activity.userTask'))).toBe('bpmn-icon-user');
    expect(iconClassFor(def('gateway.exclusive'))).toBe('bpmn-icon-gateway-xor');
    expect(iconClassFor(def('boundary.timer'))).toBe('bpmn-icon-intermediate-event-catch-timer');
    expect(iconClassFor(def('boundary.timer.nonInterrupting'))).toBe(
      'bpmn-icon-intermediate-event-catch-non-interrupting-timer',
    );
    expect(iconClassFor(def('activity.eventSubProcess'))).toBe('bpmn-icon-event-subprocess-expanded');
    expect(iconClassFor(def('flow.conditional'))).toBe('bpmn-icon-conditional-flow');
  });
});
