import { layoutProcess, type LayoutResult } from '@bpmn/layout-engine';
import {
  addTask,
  createProcess,
  splitExclusive,
  type Process,
} from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { formatScores, lintProcess, scoreParts } from './lintProcess.js';

function xml(process: string, diagram = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">
  <bpmn:process id="Process_1" isExecutable="false">
    ${process}
  </bpmn:process>
  ${diagram}
</bpmn:definitions>`;
}

function diXml(result: LayoutResult): string {
  const shapes = Object.entries(result.shapes)
    .map(
      ([id, b]) =>
        `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" /></bpmndi:BPMNShape>`,
    )
    .join('');
  return `<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">${shapes}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`;
}

function processXml(p: Process): string {
  const tag: Record<string, string> = {
    start: 'startEvent',
    end: 'endEvent',
    task: 'task',
    exclusiveGateway: 'exclusiveGateway',
    parallelGateway: 'parallelGateway',
    inclusiveGateway: 'inclusiveGateway',
  };
  const nodes = p.nodes
    .map((n) => {
      const name = n.name ? ` name="${n.name}"` : '';
      return `<bpmn:${tag[n.type] ?? 'task'} id="${n.id}"${name} />`;
    })
    .join('');
  const flows = p.flows
    .map((f) => `<bpmn:sequenceFlow id="${f.id}" sourceRef="${f.source}" targetRef="${f.target}" />`)
    .join('');
  return xml(`${nodes}${flows}`, diXml(layoutProcess(p)));
}

describe('lintProcess', () => {
  it('flags missing start/end, broken flows, and dangling nodes', () => {
    const result = lintProcess(
      xml(`
        <bpmn:task id="T1" name="Review" />
        <bpmn:endEvent id="E1" name="End" />
        <bpmn:sequenceFlow id="F1" sourceRef="T1" />
      `),
    );
    expect(result.errors.map((f) => f.id).sort()).toEqual([
      'bpmn.dangling',
      'bpmn.dangling',
      'bpmn.flow-source-target',
      'bpmn.start-required',
    ]);
    expect(result.scores.bpmn).toBeLessThan(100);
    expect(result.scores.geometry).toBeUndefined();
    expect(result.scores.execution).toBe(100);
    expect(result.executionProfile).toBe('camunda8');
  });

  it('flags unnamed XOR and a task that does not start with a verb', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Customer record' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'Customer record')!.id }).process;
    const result = lintProcess(p);
    expect(result.style.map((f) => f.id).sort()).toEqual(['style.task-verb', 'style.unnamed-xor']);
    expect(result.errors).toEqual([]);
    expect(result.scores.style).toBeLessThan(100);
    expect(result.scores.geometry).toBeUndefined();
    expect(result.layout).toBe('none');
  });

  it('skips geometry work when a caller does not display layout findings', () => {
    let process = createProcess();
    process = addTask(process, { name: 'Review request' }).process;
    const result = lintProcess(processXml(process), { geometry: 'skip' });
    expect(result.layout).toBe('none');
    expect(result.scores.geometry).toBeUndefined();
    expect(result.suggestions).toEqual([]);
  });

  it('does not apply the English verb whitelist to non-Latin task names', () => {
    let process = createProcess();
    process = addTask(process, { name: 'Проверить документы' }).process;
    const result = lintProcess(process);
    expect(result.style).toEqual([]);
  });

  it('warns when gateway count exceeds the limit', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    const after = p.nodes.find((n) => n.name === 'Review')!.id;
    p = splitExclusive(p, { after, name: 'One?' }).process;
    p = splitExclusive(p, { after: p.regions[0]!.join, name: 'Two?' }).process;
    const result = lintProcess(p, { gatewayWarnAt: 3 });
    expect(result.warnings).toEqual([
      expect.objectContaining({ id: 'quality.gateway-count', layer: 5 }),
    ]);
    expect(result.scores.quality).toBeLessThan(100);
  });

  it('scores geometry 100 only when DI matches layout-engine', () => {
    let p = createProcess({ name: 'Canonical' });
    p = addTask(p, { name: 'Review request' }).process;
    const canonical = lintProcess(processXml(p));
    expect(canonical.layout).toBe('canonical');
    expect(canonical.scores.geometry).toBe(100);
    expect(formatScores(canonical)).toContain('Layout 100');
    expect(formatScores(canonical)).not.toContain('Layout ✓');

    const free = lintProcess(
      xml(
        `
        <bpmn:startEvent id="StartEvent_1" name="Start" />
        <bpmn:task id="Activity_1" name="Review request" />
        <bpmn:endEvent id="EndEvent_1" name="End" />
        <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
        <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
      `,
        `<bpmndi:BPMNDiagram id="BPMNDiagram_1">
        <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
          <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
            <dc:Bounds x="180" y="102" width="36" height="36" />
          </bpmndi:BPMNShape>
          <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
            <dc:Bounds x="270" y="80" width="100" height="80" />
          </bpmndi:BPMNShape>
          <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
            <dc:Bounds x="430" y="102" width="36" height="36" />
          </bpmndi:BPMNShape>
        </bpmndi:BPMNPlane>
      </bpmndi:BPMNDiagram>`,
      ),
    );
    expect(free.layout).toBe('free');
    expect(free.scores.geometry).toBeUndefined();
    expect(free.suggestions.some((f) => f.id === 'geometry.free-di')).toBe(true);
    expect(formatScores(free)).toContain('Layout free DI');
    expect(formatScores(free)).not.toContain('Layout ✓');
    expect(formatScores(free)).not.toContain('Layout 100');
  });

  it('flags complex gateway and ad-hoc as unsupported on Camunda 8 / Zeebe', () => {
    const xmlResult = lintProcess(
      xml(`
        <bpmn:startEvent id="S" name="Start" />
        <bpmn:complexGateway id="G1" name="N of M" />
        <bpmn:adHocSubProcess id="A1" name="Handle extras" />
        <bpmn:endEvent id="E" name="End" />
        <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G1" />
        <bpmn:sequenceFlow id="F2" sourceRef="G1" targetRef="A1" />
        <bpmn:sequenceFlow id="F3" sourceRef="A1" targetRef="E" />
      `),
    );
    expect(xmlResult.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'execution.unsupported', layer: 2, elementId: 'G1' }),
        expect.objectContaining({ id: 'execution.partial', layer: 2, elementId: 'A1' }),
      ]),
    );
    expect(xmlResult.warnings.some((f) => f.message.includes('Camunda 8 / Zeebe'))).toBe(true);
    expect(xmlResult.style.some((f) => f.id === 'style.unnamed-xor')).toBe(false);
    expect(xmlResult.scores.bpmn).toBe(100);
    expect(xmlResult.scores.execution).toBe(60);
    expect(xmlResult.scores.quality).toBe(100);
    expect(formatScores(xmlResult)).toContain('Execution 60');

    const origin = createProcess();
    const start = origin.nodes.find((n) => n.type === 'start')!;
    const end = origin.nodes.find((n) => n.type === 'end')!;
    const graph: Process = {
      ...origin,
      nodes: [
        start,
        { id: 'ComplexGateway_1', type: 'exclusiveGateway', name: 'N of M', bpmnType: 'bpmn:ComplexGateway' },
        { id: 'AdHoc_1', type: 'task', name: 'Handle extras', bpmnType: 'bpmn:AdHocSubProcess' },
        end,
      ],
      flows: [
        { id: 'f1', source: start.id, target: 'ComplexGateway_1' },
        { id: 'f2', source: 'ComplexGateway_1', target: 'AdHoc_1' },
        { id: 'f3', source: 'AdHoc_1', target: end.id },
      ],
    };
    const ir = lintProcess(graph);
    expect(ir.warnings.map((f) => f.id).sort()).toEqual(['execution.partial', 'execution.unsupported']);
    expect(ir.scores.execution).toBe(60);
  });

  it('scores Execution separately and omits it when the profile did not run', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review request' }).process;
    const ran = lintProcess(p);
    expect(ran.executionProfile).toBe('camunda8');
    expect(ran.scores.execution).toBe(100);
    expect(scoreParts(ran)).toContain('Execution 100');
    expect(formatScores(ran)).toContain('Execution 100');

    const skipped = lintProcess(p, { executionProfile: 'none' });
    expect(skipped.executionProfile).toBe('none');
    expect(skipped.scores.execution).toBeUndefined();
    expect(scoreParts(skipped).some((part) => part.startsWith('Execution'))).toBe(false);
    expect(formatScores(skipped)).not.toContain('Execution');

    const parseFail = lintProcess('');
    expect(parseFail.executionProfile).toBe('none');
    expect(parseFail.scores.execution).toBeUndefined();
    expect(formatScores(parseFail)).not.toContain('Execution');
    expect(parseFail.scores.bpmn).toBeLessThan(100);
  });

  it('does not flag XOR / AND / inclusive on the Camunda 8 profile', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review request' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'Review request')!.id, name: 'Approved?' }).process;
    const result = lintProcess(p);
    expect(result.warnings.filter((f) => f.layer === 2)).toEqual([]);
    expect(result.scores.execution).toBe(100);
  });

  it('scores a ran neutral profile at 100 without Zeebe flags', () => {
    const result = lintProcess(
      xml(`
        <bpmn:startEvent id="S" name="Start" />
        <bpmn:complexGateway id="G1" name="N of M" />
        <bpmn:endEvent id="E" name="End" />
        <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G1" />
        <bpmn:sequenceFlow id="F2" sourceRef="G1" targetRef="E" />
      `),
      { executionProfile: 'neutral' },
    );
    expect(result.executionProfile).toBe('neutral');
    expect(result.warnings.filter((f) => f.layer === 2)).toEqual([]);
    expect(result.scores.execution).toBe(100);
    expect(formatScores(result)).toContain('Execution 100');
  });
});
