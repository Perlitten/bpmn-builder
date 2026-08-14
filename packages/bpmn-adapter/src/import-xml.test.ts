import { describe, expect, it } from 'vitest';
import { BpmnImportError, importBpmnXml, sniffBpmnXml } from './import-xml.js';
import { xmlToProcess } from './semantic-xml.js';

const VALID = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Linear" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:task id="Activity_1" name="Task" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const DEFAULT_NS = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" name="Start" />
    <endEvent id="EndEvent_1" name="End" />
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </process>
</definitions>`;

const BPMN2_PREFIX = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn2:process id="Process_1" isExecutable="false">
    <bpmn2:startEvent id="StartEvent_1" />
    <bpmn2:endEvent id="EndEvent_1" />
    <bpmn2:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn2:process>
</bpmn2:definitions>`;

const COLLAB_WITH_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Clerk" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const COLLAB_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Partner" />
  </bpmn:collaboration>
</bpmn:definitions>`;

const EMPTY_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false" />
</bpmn:definitions>`;

const DEFINITIONS_ONLY = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"/>`;

const BPMN_1X = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/1.2">
  <bpmn:process id="Process_1" />
</bpmn:definitions>`;

const BROKEN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="StartEvent_1"
</bpmn:definitions>`;

function sniffCode(source: string | Uint8Array, filename?: string) {
  const result = sniffBpmnXml(source, filename ? { filename } : undefined);
  return result.ok ? 'ok' : result.code;
}

function sniffMessage(source: string | Uint8Array, filename?: string) {
  const result = sniffBpmnXml(source, filename ? { filename } : undefined);
  return result.ok ? '' : result.message;
}

describe('sniffBpmnXml', () => {
  it('accepts BPMN 2.0 definitions with a process', () => {
    expect(sniffBpmnXml(VALID)).toMatchObject({ ok: true });
    expect(sniffBpmnXml(DEFAULT_NS)).toMatchObject({ ok: true });
    expect(sniffBpmnXml(BPMN2_PREFIX)).toMatchObject({ ok: true });
    expect(sniffBpmnXml(COLLAB_WITH_PROCESS)).toMatchObject({ ok: true });
    expect(sniffBpmnXml(COLLAB_ONLY)).toMatchObject({ ok: true });
    expect(sniffBpmnXml(EMPTY_PROCESS)).toMatchObject({ ok: true });
  });

  it('rejects empty, non-XML, HTML, and JSON', () => {
    expect(sniffCode('')).toBe('empty');
    expect(sniffMessage('')).toMatch(/empty/i);
    expect(sniffCode('   \n')).toBe('empty');
    expect(sniffCode('not xml at all')).toBe('not_xml');
    expect(sniffMessage('hello')).toMatch(/not XML/i);
    expect(sniffCode('<html><body>diagram</body></html>')).toBe('html');
    expect(sniffMessage('<!DOCTYPE html><html></html>')).toMatch(/HTML/);
    expect(sniffCode('{"process":[]}')).toBe('json');
    expect(sniffMessage('[1,2]')).toMatch(/JSON/);
  });

  it('rejects missing definitions, BPMN 1.x, and definitions with no process', () => {
    expect(sniffCode('<svg xmlns="http://www.w3.org/2000/svg"><definitions/></svg>')).toBe('no_definitions');
    expect(sniffCode('<definitions xmlns="http://www.w3.org/2000/svg"><process id="P"/></definitions>')).toBe(
      'not_bpmn_20',
    );
    expect(sniffCode(BPMN_1X)).toBe('bpmn_1x');
    expect(sniffMessage(BPMN_1X)).toMatch(/BPMN 1\.x|XPDL/);
    expect(sniffCode(DEFINITIONS_ONLY)).toBe('no_process');
    expect(sniffMessage(DEFINITIONS_ONLY)).toMatch(/no process/i);
  });

  it('rejects zip, xlsx, and binary', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    expect(sniffCode(zip)).toBe('archive');
    expect(sniffMessage(zip, 'book.xlsx')).toMatch(/spreadsheet/i);
    expect(sniffMessage(zip, 'pack.zip')).toMatch(/zip/i);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(sniffCode(png)).toBe('binary');
    expect(sniffMessage(png)).toMatch(/binary/i);
  });
});

describe('importBpmnXml', () => {
  it('parses valid BPMN 2.0, including default namespace and collaboration', async () => {
    const linear = await importBpmnXml(VALID);
    expect(linear.process.nodes.map((n) => n.type).sort()).toEqual(['end', 'start', 'task']);
    expect(linear.xml).toContain('Process_1');

    const defNs = await importBpmnXml(DEFAULT_NS);
    expect(defNs.process.nodes.some((n) => n.type === 'start')).toBe(true);

    const collab = await importBpmnXml(COLLAB_WITH_PROCESS);
    expect(collab.process.participants[0]?.name).toBe('Clerk');
    expect(collab.process.nodes.some((n) => n.type === 'start')).toBe(true);

    const fromTxt = await importBpmnXml(new TextEncoder().encode(VALID), { filename: 'order.txt' });
    expect(fromTxt.process.nodes).toHaveLength(3);
  });

  it('rejects empty processes and collaboration-only diagrams after parse', async () => {
    await expect(importBpmnXml(EMPTY_PROCESS)).rejects.toMatchObject({
      name: 'BpmnImportError',
      code: 'no_flow_nodes',
    });
    await expect(importBpmnXml(COLLAB_ONLY)).rejects.toBeInstanceOf(BpmnImportError);
    await expect(importBpmnXml(COLLAB_ONLY)).rejects.toMatchObject({ code: 'no_flow_nodes' });
    const mapped = await xmlToProcess(COLLAB_ONLY);
    expect(mapped.participants).toHaveLength(1);
    expect(mapped.nodes).toHaveLength(0);
  });

  it('surfaces adapter parse errors and does not apply broken XML', async () => {
    await expect(importBpmnXml(BROKEN)).rejects.toMatchObject({ code: 'parse_error' });
    await expect(importBpmnXml(BROKEN)).rejects.toThrow(/Could not parse BPMN 2\.0 XML/);
    await expect(importBpmnXml('<html></html>')).rejects.toMatchObject({ code: 'html' });
    await expect(importBpmnXml('')).rejects.toMatchObject({ code: 'empty' });
  });
});
