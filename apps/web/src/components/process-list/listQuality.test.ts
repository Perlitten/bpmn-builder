import { describe, expect, it } from 'vitest';
import { DEFAULT_EXECUTION_PROFILE, lintProcess } from '@bpmn/rules';
import { listQualitySignal } from './listQuality';

const CLEAN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="P">
    <startEvent id="S" />
    <task id="T1" name="Submit request" />
    <endEvent id="E1" />
    <sequenceFlow id="F1" sourceRef="S" targetRef="T1" />
    <sequenceFlow id="F2" sourceRef="T1" targetRef="E1" />
  </process>
</definitions>`;

const XOR = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="P" name="Approval">
    <startEvent id="S" />
    <task id="T1" name="Submit request" />
    <exclusiveGateway id="G" name="Approved?" />
    <task id="T2" name="Order approval" />
    <endEvent id="E1" />
    <sequenceFlow id="F1" sourceRef="S" targetRef="T1" />
    <sequenceFlow id="F2" sourceRef="T1" targetRef="G" />
    <sequenceFlow id="F3" sourceRef="G" targetRef="T2" name="Yes" />
    <sequenceFlow id="F4" sourceRef="G" targetRef="E1" name="No" />
    <sequenceFlow id="F5" sourceRef="T2" targetRef="E1" />
  </process>
</definitions>`;

const NO_START = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="P">
    <task id="T1" name="Submit request" />
    <endEvent id="E1" />
    <sequenceFlow id="F1" sourceRef="T1" targetRef="E1" />
  </process>
</definitions>`;

function lint(xml: string) {
  return lintProcess(xml, { executionProfile: DEFAULT_EXECUTION_PROFILE });
}

describe('listQualitySignal', () => {
  it('stays quiet when the model is clean, including freeform DI', () => {
    expect(listQualitySignal(lint(CLEAN))).toBeNull();
  });

  it('summarizes style as a finding count, not BPMN 100 chips', () => {
    const signal = listQualitySignal(lint(XOR));
    expect(signal?.label).toMatch(/style finding/);
    expect(signal?.title).toBe('Style');
    expect(signal?.label).not.toMatch(/BPMN \d+|Style \d+|Layout free DI/);
  });

  it('names BPMN findings without a format-score chip', () => {
    const signal = listQualitySignal(lint(NO_START));
    expect(signal?.label).toMatch(/\d+ (error|errors|bpmn finding|bpmn findings)/);
    expect(signal?.title).toContain('BPMN');
    expect(signal?.label).not.toContain('BPMN 100');
  });

  it('keeps every severity tier visible in the compact signal', () => {
    const signal = listQualitySignal({
      ...lint(CLEAN),
      errors: [{ id: 'e', layer: 1, severity: 'error', message: 'Error' }],
      warnings: [{ id: 'w', layer: 5, severity: 'warning', message: 'Warning' }],
      style: [{ id: 's', layer: 3, severity: 'style', message: 'Style' }],
    });
    expect(signal?.label).toBe('1 error · 1 warning · 1 style finding');
    expect(signal?.title).toBe('BPMN · Quality · Style');
  });
});
