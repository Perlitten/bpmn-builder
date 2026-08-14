import { describe, expect, it } from 'vitest';
import { looksLikeBpmn, readBpmnFile } from './readBpmnFile';

const VALID = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

describe('looksLikeBpmn', () => {
  it('accepts BPMN 2.0 with a process', () => {
    expect(looksLikeBpmn(VALID)).toBe(true);
  });

  it('rejects empty, HTML, JSON, and definitions without a process', () => {
    expect(looksLikeBpmn('')).toBe(false);
    expect(looksLikeBpmn('<html></html>')).toBe(false);
    expect(looksLikeBpmn('{"ok":true}')).toBe(false);
    expect(looksLikeBpmn('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"/>')).toBe(
      false,
    );
  });
});

describe('readBpmnFile', () => {
  it('imports valid BPMN even when the file is named .txt', async () => {
    const xml = await readBpmnFile(new File([VALID], 'claim.txt', { type: 'text/plain' }));
    expect(xml).toContain('StartEvent_1');
  });

  it('rejects empty, HTML, and JSON with a specific reason', async () => {
    await expect(readBpmnFile(new File([], 'empty.bpmn'))).rejects.toThrow(/empty/i);
    await expect(readBpmnFile(new File(['<!DOCTYPE html><html></html>'], 'page.bpmn'))).rejects.toThrow(/HTML/);
    await expect(readBpmnFile(new File(['{"a":1}'], 'data.xml'))).rejects.toThrow(/JSON/);
  });
});
