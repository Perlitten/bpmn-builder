import { describe, expect, it } from 'vitest';
import { DEFAULT_BPMN_XML } from './defaultBpmnXml';
import { hasStartEvent, usableXml } from './usableXml';

describe('usableXml', () => {
  it('keeps bpmn: and unprefixed start events', () => {
    expect(hasStartEvent('<bpmn:startEvent id="StartEvent_1" />')).toBe(true);
    expect(hasStartEvent('<startEvent id="StartEvent_1" />')).toBe(true);
    expect(usableXml('<bpmn:startEvent id="A" />')).toBe('<bpmn:startEvent id="A" />');
  });

  it('keeps bpmn2:-prefixed files instead of swapping the starter diagram', () => {
    const xml = `<bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn2:process id="Process_1">
    <bpmn2:startEvent id="StartEvent_1" />
  </bpmn2:process>
</bpmn2:definitions>`;
    expect(hasStartEvent(xml)).toBe(true);
    expect(usableXml(xml)).toBe(xml);
    expect(usableXml(xml)).not.toBe(DEFAULT_BPMN_XML);
  });

  it('falls back when there is no start event', () => {
    expect(usableXml('<bpmn:task id="A" />')).toBe(DEFAULT_BPMN_XML);
  });
});
