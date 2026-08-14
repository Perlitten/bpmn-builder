import { describe, expect, it } from 'vitest';
import { previewBpmn, processNameFromBpmn, processNameFromDescription, previewStructure } from './bpmnPreview';

const STARTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:task id="Activity_1" name="Task" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const XOR = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="P" name="Approval">
    <startEvent id="S" />
    <task id="T1" name="Submit" />
    <exclusiveGateway id="G" />
    <task id="T2" name="Approve" />
    <task id="T3" name="Reject" />
    <endEvent id="E1" />
    <endEvent id="E2" />
    <sequenceFlow id="F1" sourceRef="S" targetRef="T1" />
    <sequenceFlow id="F2" sourceRef="T1" targetRef="G" />
    <sequenceFlow id="F3" sourceRef="G" targetRef="T2" />
    <sequenceFlow id="F4" sourceRef="G" targetRef="T3" />
    <sequenceFlow id="F5" sourceRef="T2" targetRef="E1" />
    <sequenceFlow id="F6" sourceRef="T3" targetRef="E2" />
  </process>
</definitions>`;

describe('previewBpmn', () => {
  it('shows an honest empty process', () => {
    expect(previewBpmn('')).toMatchObject({ kind: 'empty', happyPath: 'Empty process' });
    expect(previewBpmn('<bpmn:definitions><bpmn:process id="P" /></bpmn:definitions>')).toMatchObject({
      kind: 'empty',
      happyPath: 'Empty process',
    });
  });

  it('labels the starter Start-Task-End honestly', () => {
    const preview = previewBpmn(STARTER);
    expect(preview.kind).toBe('starter');
    expect(preview.happyPath).toBe('●──[Task]──◎');
    expect(preview.counts).toBe('1 task · 1 end');
  });

  it('uses the Start-Task-End process when an earlier process is empty', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Empty_1" />
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:task id="Activity_1" name="Task" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;
    expect(previewBpmn(xml)).toMatchObject({ kind: 'starter', happyPath: '●──[Task]──◎' });
  });

  it('reads nested incoming/outgoing on the default starter', () => {
    const nested = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Task">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;
    expect(previewBpmn(nested)).toMatchObject({ kind: 'starter', happyPath: '●──[Task]──◎' });
  });

  it('walks an XOR split with a real branch', () => {
    const preview = previewBpmn(XOR);
    expect(preview.kind).toBe('process');
    expect(preview.happyPath).toBe('●──[Submit]──◇──[Approve]──◎');
    expect(preview.branches).toEqual(['[Reject]──◎']);
    expect(preview.counts).toContain('XOR');
    expect(preview.counts).toContain('3 tasks');
    expect(previewStructure(preview)).toMatch(/XOR/);
    expect(previewStructure(preview)).toMatch(/2 branches/);
  });

  it('labels identical starter thumbnails with an honest starter structure line', () => {
    expect(previewStructure(previewBpmn(STARTER))).toBe('Starter · 1 task · 1 end');
  });

  it('does not invent a decorative three-shape placeholder', () => {
    const preview = previewBpmn('<not-bpmn>');
    expect(preview.happyPath).toBe('Could not parse BPMN');
    expect(preview.happyPath).not.toMatch(/○\s*▭\s*○/);
  });
});

describe('process names', () => {
  it('uses the first line of a description', () => {
    expect(processNameFromDescription('Invoice approval\nthen pay')).toBe('Invoice approval');
  });

  it('reads the BPMN process name', () => {
    expect(processNameFromBpmn(XOR, 'file.bpmn')).toBe('Approval');
  });
});
