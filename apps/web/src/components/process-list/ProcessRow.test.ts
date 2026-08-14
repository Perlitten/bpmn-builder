import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProcessSummary } from '@bpmn/domain';
import { ProcessRow } from './ProcessRow';

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

function summary(name: string, xml: string): ProcessSummary {
  return {
    id: name,
    name,
    description: null,
    status: 'draft',
    bpmnXml: xml,
    version: 1,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  };
}

describe('ProcessRow', () => {
  it('distinguishes starter drafts from branched processes without inventing lifecycle statuses', () => {
    const starter = renderToStaticMarkup(
      createElement(ProcessRow, { process: summary('Untitled process', STARTER), onOpen: () => undefined }),
    );
    const xor = renderToStaticMarkup(
      createElement(ProcessRow, { process: summary('Approval', XOR), onOpen: () => undefined }),
    );
    expect(starter).toContain('Untitled process');
    expect(starter).toContain('Starter · 1 task · 1 end');
    expect(starter).not.toMatch(/Draft|Published|Archived/);
    expect(xor).toContain('Approval');
    expect(xor).toMatch(/XOR/);
    expect(xor).toMatch(/2 branches/);
    expect(xor).not.toContain('role="img"');
    expect(xor).not.toContain('Starter · 1 task · 1 end');
    expect(starter).not.toMatch(/BPMN \d+|Style \d+|Quality \d+|Execution \d+|Layout /);
    expect(xor).not.toMatch(/BPMN \d+|Style \d+|Quality \d+|Execution \d+|Layout /);
    expect(starter).toContain('style finding');
    expect(xor).toContain('style finding');
  });

  it('renders accessible rename/delete actions and a semantic timestamp', () => {
    const html = renderToStaticMarkup(
      createElement(ProcessRow, {
        process: summary('Approval', XOR),
        onOpen: () => undefined,
        onRename: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
      }),
    );
    expect(html).toContain('aria-label="Actions for Approval"');
    expect(html).toContain('<time');
    expect(html).toContain('dateTime="2026-08-13T00:00:00.000Z"');
    expect(html).toContain('py-3');
  });

  it('keeps row actions when Duplicate is the only overflow action', () => {
    const html = renderToStaticMarkup(
      createElement(ProcessRow, {
        process: summary('Approval', XOR),
        onOpen: () => undefined,
        onDuplicate: () => undefined,
      }),
    );
    expect(html).toContain('aria-label="Actions for Approval"');
  });
});
