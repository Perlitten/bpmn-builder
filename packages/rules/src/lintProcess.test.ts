import { layoutProcess, type LayoutResult } from '@bpmn/layout-engine';
import {
  addSubProcess,
  addTask,
  attachBoundaryTimer,
  createEventSubprocess,
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
    expect(formatScores(canonical)).toContain('Layout: canonical');
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
    expect(formatScores(free)).toContain('Layout: free DI');
    expect(formatScores(free)).not.toContain('Layout ✓');
    expect(formatScores(free)).not.toContain('Layout: canonical');
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

  it('does not treat a boundary timer or event subprocess as sequence-flow orphans', () => {
    let p = createProcess();
    p = addSubProcess(p, { name: 'Assess', id: 'Sub_Assess' }).process;
    p = attachBoundaryTimer(p, { on: 'Sub_Assess', name: 'After 48h' }).process;
    p = createEventSubprocess(p, { name: 'Escalation handler', id: 'EvSub_Escalation' }).process;
    const boundary = p.nodes.find((n) => n.type === 'boundaryEvent')!;
    expect(boundary.attachedTo).toBe('Sub_Assess');
    expect(p.nodes.find((n) => n.id === 'EvSub_Escalation')?.triggeredByEvent).toBe(true);

    const result = lintProcess(p);
    expect(result.errors).toEqual([]);
    expect(result.scores.bpmn).toBe(100);
    expect(result.errors.some((f) => /is not connected/.test(f.message))).toBe(false);
  });

  it('reads attachedToRef / triggeredByEvent from XML the same way', () => {
    const result = lintProcess(
      xml(`
        <bpmn:startEvent id="StartEvent_1" name="Start" />
        <bpmn:subProcess id="Sub_Assess" name="Assess">
          <bpmn:startEvent id="Sub_Start" />
          <bpmn:endEvent id="Sub_End" />
          <bpmn:sequenceFlow id="Sub_Flow" sourceRef="Sub_Start" targetRef="Sub_End" />
        </bpmn:subProcess>
        <bpmn:boundaryEvent id="Bnd_Timer" name="After 48h" attachedToRef="Sub_Assess">
          <bpmn:timerEventDefinition />
        </bpmn:boundaryEvent>
        <bpmn:endEvent id="Bnd_End" name="Timed out" />
        <bpmn:sequenceFlow id="Bnd_Flow" sourceRef="Bnd_Timer" targetRef="Bnd_End" />
        <bpmn:subProcess id="EvSub_Escalation" name="Escalation handler" triggeredByEvent="true">
          <bpmn:startEvent id="Ev_Start" name="Error">
            <bpmn:errorEventDefinition />
          </bpmn:startEvent>
          <bpmn:task id="Ev_Task" name="Handle escalation" />
          <bpmn:endEvent id="Ev_End" />
          <bpmn:sequenceFlow id="Ev_F1" sourceRef="Ev_Start" targetRef="Ev_Task" />
          <bpmn:sequenceFlow id="Ev_F2" sourceRef="Ev_Task" targetRef="Ev_End" />
        </bpmn:subProcess>
        <bpmn:endEvent id="EndEvent_1" name="End" />
        <bpmn:sequenceFlow id="F1" sourceRef="StartEvent_1" targetRef="Sub_Assess" />
        <bpmn:sequenceFlow id="F2" sourceRef="Sub_Assess" targetRef="EndEvent_1" />
      `),
    );
    expect(result.errors).toEqual([]);
    expect(result.scores.bpmn).toBe(100);
    expect(result.errors.some((f) => f.elementId === 'Bnd_Timer' || f.elementId === 'EvSub_Escalation')).toBe(false);
  });

  it('still flags an unattached or outgoing-less boundary, and a subprocess that is not event-triggered', () => {
    const result = lintProcess(
      xml(`
        <bpmn:startEvent id="S" name="Start" />
        <bpmn:task id="T1" name="Review request" />
        <bpmn:boundaryEvent id="B1" name="After 48h" />
        <bpmn:boundaryEvent id="B2" name="On error" attachedToRef="T1" />
        <bpmn:subProcess id="Sub_Orphan" name="Nested work" />
        <bpmn:endEvent id="E" name="End" />
        <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T1" />
        <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="E" />
      `),
    );
    const dangling = result.errors.filter((f) => f.id === 'bpmn.dangling');
    expect(dangling).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementId: 'B1',
          message: 'Boundary event “After 48h” is not attached to an activity',
        }),
        expect.objectContaining({
          elementId: 'B1',
          message: 'Boundary event “After 48h” has no outgoing sequence flow',
        }),
        expect.objectContaining({
          elementId: 'B2',
          message: 'Boundary event “On error” has no outgoing sequence flow',
        }),
        expect.objectContaining({
          elementId: 'Sub_Orphan',
          message: 'Subprocess “Nested work” is not connected',
        }),
      ]),
    );
    expect(dangling.some((f) => f.elementId === 'T1')).toBe(false);
  });

  it('does not treat boundary timers, message starts, or event subprocesses as execution hits', () => {
    const src = xml(`
      <bpmn:startEvent id="Start_Msg" name="Claim submitted">
        <bpmn:messageEventDefinition messageRef="Msg_Claim" />
      </bpmn:startEvent>
      <bpmn:subProcess id="Sub_Assess" name="Assess damage">
        <bpmn:startEvent id="Sub_Start" />
        <bpmn:endEvent id="Sub_End" />
        <bpmn:sequenceFlow id="Sub_Flow" sourceRef="Sub_Start" targetRef="Sub_End" />
      </bpmn:subProcess>
      <bpmn:boundaryEvent id="Bnd_Timer" name="After 48h" cancelActivity="false" attachedToRef="Sub_Assess">
        <bpmn:timerEventDefinition>
          <bpmn:timeDuration>PT48H</bpmn:timeDuration>
        </bpmn:timerEventDefinition>
      </bpmn:boundaryEvent>
      <bpmn:endEvent id="Bnd_End" name="Timed out" />
      <bpmn:sequenceFlow id="Bnd_Flow" sourceRef="Bnd_Timer" targetRef="Bnd_End" />
      <bpmn:subProcess id="EvSub_Escalation" name="Escalation handler" triggeredByEvent="true">
        <bpmn:startEvent id="Ev_Start" name="Error caught">
          <bpmn:errorEventDefinition />
        </bpmn:startEvent>
        <bpmn:endEvent id="Ev_End" />
        <bpmn:sequenceFlow id="Ev_F1" sourceRef="Ev_Start" targetRef="Ev_End" />
      </bpmn:subProcess>
      <bpmn:endEvent id="EndEvent_1" name="Claim settled" />
      <bpmn:sequenceFlow id="F1" sourceRef="Start_Msg" targetRef="Sub_Assess" />
      <bpmn:sequenceFlow id="F2" sourceRef="Sub_Assess" targetRef="EndEvent_1" />
    `);
    const xmlResult = lintProcess(src);
    const ids = ['Start_Msg', 'Bnd_Timer', 'EvSub_Escalation', 'Ev_Start'];
    expect(xmlResult.warnings.filter((f) => f.layer === 2 && ids.includes(f.elementId ?? ''))).toEqual([]);
    expect(xmlResult.style.some((f) => f.elementId === 'EvSub_Escalation')).toBe(false);
    expect(xmlResult.scores.execution).toBe(100);

    let p = createProcess();
    p = addSubProcess(p, { name: 'Assess damage', id: 'Sub_Assess' }).process;
    p = attachBoundaryTimer(p, { on: 'Sub_Assess', name: 'After 48h', interrupting: false }).process;
    p = createEventSubprocess(p, { name: 'Escalation handler', id: 'EvSub_Escalation' }).process;
    const start = p.nodes.find((n) => n.type === 'start' && !n.eventDefinition)!;
    p = {
      ...p,
      nodes: p.nodes.map((n) =>
        n.id === start.id ? { ...n, name: 'Claim submitted', eventDefinition: 'MessageEventDefinition' } : n,
      ),
    };
    const graphResult = lintProcess(p);
    expect(graphResult.warnings.filter((f) => f.layer === 2 && ids.includes(f.elementId ?? ''))).toEqual([]);
    expect(graphResult.style.some((f) => f.id === 'style.task-verb' && f.elementId === 'EvSub_Escalation')).toBe(
      false,
    );
    expect(graphResult.scores.execution).toBe(xmlResult.scores.execution);
  });

  it('still flags a Camunda 8 gap on ad-hoc, not on a boundary timer in the same model', () => {
    const result = lintProcess(
      xml(`
        <bpmn:startEvent id="S" name="Start" />
        <bpmn:adHocSubProcess id="A1" name="Handle extras">
          <bpmn:task id="AdHoc_Inner" name="Call garage" />
        </bpmn:adHocSubProcess>
        <bpmn:boundaryEvent id="Bnd_Timer" name="After 48h" attachedToRef="A1">
          <bpmn:timerEventDefinition />
        </bpmn:boundaryEvent>
        <bpmn:endEvent id="BE" name="Timed out" />
        <bpmn:endEvent id="E" name="End" />
        <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A1" />
        <bpmn:sequenceFlow id="F2" sourceRef="A1" targetRef="E" />
        <bpmn:sequenceFlow id="F3" sourceRef="Bnd_Timer" targetRef="BE" />
      `),
    );
    expect(result.warnings.filter((f) => f.layer === 2)).toEqual([
      expect.objectContaining({ id: 'execution.partial', layer: 2, elementId: 'A1' }),
    ]);
    expect(result.scores.execution).toBe(85);
    expect(result.errors.some((f) => f.elementId === 'AdHoc_Inner')).toBe(false);
    expect(result.errors.some((f) => f.elementId === 'A1' || f.elementId === 'Bnd_Timer')).toBe(false);
  });

  it('does not treat compensation or link as sequence-flow orphans', () => {
    const result = lintProcess(
      xml(`
        <bpmn:startEvent id="S" name="Start" />
        <bpmn:task id="T1" name="Book hotel" />
        <bpmn:boundaryEvent id="Bnd_Comp" name="Undo hotel" attachedToRef="T1">
          <bpmn:compensateEventDefinition />
        </bpmn:boundaryEvent>
        <bpmn:task id="Undo_Hotel" name="Cancel hotel" isForCompensation="true" />
        <bpmn:association id="As_Comp" sourceRef="Bnd_Comp" targetRef="Undo_Hotel" associationDirection="One" />
        <bpmn:intermediateThrowEvent id="Throw_Link" name="to review">
          <bpmn:linkEventDefinition name="review" />
        </bpmn:intermediateThrowEvent>
        <bpmn:intermediateCatchEvent id="Catch_Link" name="from booking">
          <bpmn:linkEventDefinition name="review" />
        </bpmn:intermediateCatchEvent>
        <bpmn:endEvent id="E" name="End" />
        <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T1" />
        <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="Throw_Link" />
        <bpmn:sequenceFlow id="F3" sourceRef="Catch_Link" targetRef="E" />
      `),
    );
    expect(result.errors.filter((f) => f.elementId === 'Bnd_Comp' || f.elementId === 'Undo_Hotel')).toEqual([]);
    expect(result.errors.filter((f) => f.elementId === 'Throw_Link' || f.elementId === 'Catch_Link')).toEqual([]);
    expect(result.errors.some((f) => /is not connected/.test(f.message))).toBe(false);
  });

  it('reports geometry findings and free layout for a model with overlapping labels', () => {
    const modelWithOverlappingLabels = xml(
      `
      <bpmn:startEvent id="StartEvent_1" name="Start" />
      <bpmn:task id="Activity_1" name="Review" />
      <bpmn:endEvent id="EndEvent_1" name="End" />
      <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
      <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
      `,
      `<bpmndi:BPMNDiagram id="BPMNDiagram_1">
        <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
          <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
            <dc:Bounds x="100" y="100" width="36" height="36" />
          </bpmndi:BPMNShape>
          <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
            <dc:Bounds x="200" y="100" width="100" height="80" />
            <bpmndi:BPMNLabel>
              <dc:Bounds x="210" y="105" width="80" height="20" />
            </bpmndi:BPMNLabel>
          </bpmndi:BPMNShape>
          <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
            <dc:Bounds x="350" y="100" width="36" height="36" />
          </bpmndi:BPMNShape>
          <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
            <bpmndi:BPMNLabel>
              <dc:Bounds x="205" y="102" width="50" height="20" />
            </bpmndi:BPMNLabel>
          </bpmndi:BPMNEdge>
        </bpmndi:BPMNPlane>
      </bpmndi:BPMNDiagram>`,
    );

    const result = lintProcess(modelWithOverlappingLabels);
    expect(result.layout).toBe('free');
    expect(result.layout).not.toBe('canonical');
    expect(result.suggestions.some((f) => f.id.startsWith('geometry.'))).toBe(true);
  });

  it('reports canonical layout and overlap finding without free-di for canonical DI that has overlaps', () => {
    let p = createProcess({ name: 'Canonical' });
    p = addTask(p, { name: 'Review request' }).process;
    const baseXml = processXml(p);

    const xmlWithOverlap = baseXml.replace(
      '</bpmndi:BPMNPlane>',
      `<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="SequenceFlow_1">
         <bpmndi:BPMNLabel>
           <dc:Bounds x="230" y="160" width="50" height="20" />
         </bpmndi:BPMNLabel>
       </bpmndi:BPMNEdge>
       </bpmndi:BPMNPlane>`,
    );

    const result = lintProcess(xmlWithOverlap);
    expect(result.layout).toBe('canonical');
    expect(result.suggestions.some((f) => f.id === 'geometry.label-overlaps-node')).toBe(true);
    expect(result.suggestions.some((f) => f.id === 'geometry.free-di')).toBe(false);
  });

  it('reports canonical layout with no geometry findings for a model laid out by layout-engine', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Submit request' }).process;
    p = addTask(p, { name: 'Review request' }).process;
    const result = lintProcess(processXml(p));
    expect(result.layout).toBe('canonical');
    expect(result.suggestions.filter((f) => f.id.startsWith('geometry.'))).toEqual([]);
  });

  it('fails Quality score (returns less than 100) when the model contains an unnamed task', () => {
    const modelWithUnnamedTask = xml(`
      <bpmn:startEvent id="Start" name="Start" />
      <bpmn:task id="Activity_1" />
      <bpmn:endEvent id="End" name="End" />
      <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Activity_1" />
      <bpmn:sequenceFlow id="F2" sourceRef="Activity_1" targetRef="End" />
    `);
    const result = lintProcess(modelWithUnnamedTask);
    expect(result.warnings.some((f) => f.id === 'quality.unnamed-task')).toBe(true);
    expect(result.scores.quality).toBeLessThan(100);
  });

  it('scores Quality 100 for an unnamed parallel gateway and unlabeled AND branches', () => {
    const parallelModel = xml(`
      <bpmn:startEvent id="S" name="Start" />
      <bpmn:parallelGateway id="G1" />
      <bpmn:task id="T1" name="Send invoice" />
      <bpmn:task id="T2" name="Notify customer" />
      <bpmn:parallelGateway id="G2" />
      <bpmn:endEvent id="E" name="End" />
      <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G1" />
      <bpmn:sequenceFlow id="F2" sourceRef="G1" targetRef="T1" />
      <bpmn:sequenceFlow id="F3" sourceRef="G1" targetRef="T2" />
      <bpmn:sequenceFlow id="F4" sourceRef="T1" targetRef="G2" />
      <bpmn:sequenceFlow id="F5" sourceRef="T2" targetRef="G2" />
      <bpmn:sequenceFlow id="F6" sourceRef="G2" targetRef="E" />
    `);
    const result = lintProcess(parallelModel);
    expect(result.scores.quality).toBe(100);
    expect(result.warnings.filter((f) => f.layer === 5)).toEqual([]);
  });

  it('does not apply task-verb to an event subprocess, boundary, or gateway collapsed as task', () => {
    let p = createProcess();
    p = addSubProcess(p, { name: 'Assess damage', id: 'Sub_Assess' }).process;
    p = attachBoundaryTimer(p, { on: 'Sub_Assess', name: 'After 48h' }).process;
    p = createEventSubprocess(p, { name: 'Escalation handler', id: 'EvSub_Escalation' }).process;
    const named = lintProcess(p);
    expect(named.style.some((f) => f.elementId === 'EvSub_Escalation')).toBe(false);
    expect(named.style.some((f) => f.elementId === p.nodes.find((n) => n.type === 'boundaryEvent')?.id)).toBe(false);

    const origin = createProcess();
    const start = origin.nodes.find((n) => n.type === 'start')!;
    const end = origin.nodes.find((n) => n.type === 'end')!;
    const collapsed: Process = {
      ...origin,
      nodes: [start, { id: 'ComplexGateway_1', type: 'task', name: 'N of M', bpmnType: 'bpmn:ComplexGateway' }, end],
      flows: [
        { id: 'f1', source: start.id, target: 'ComplexGateway_1' },
        { id: 'f2', source: 'ComplexGateway_1', target: end.id },
      ],
    };
    const result = lintProcess(collapsed);
    expect(result.style.some((f) => f.elementId === 'ComplexGateway_1')).toBe(false);
    expect(result.warnings).toEqual([
      expect.objectContaining({ id: 'execution.unsupported', layer: 2, elementId: 'ComplexGateway_1' }),
    ]);
  });
});
