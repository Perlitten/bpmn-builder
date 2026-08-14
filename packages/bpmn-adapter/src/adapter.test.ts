import { addLane, addMessageInteraction, addPool, addTask, createEventSubprocess, createProcess, renameElement, splitExclusive, splitInclusive, splitParallel, wrapInSubprocess } from '@bpmn/semantic-core';
import { layoutProcess, TOKENS } from '@bpmn/layout-engine';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bpmnToWorkflow, workflowToBpmn } from './workflow.js';
import { exportProcessXml, readDiFromXml, xmlToProcess } from './semantic-xml.js';
import type { Process } from '@bpmn/semantic-core';

function graphKey(p: Process) {
  return {
    id: p.id,
    nodes: [...p.nodes]
      .map((n) => ({ id: n.id, type: n.type, name: n.name, triggeredByEvent: !!n.triggeredByEvent }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    flows: [...p.flows]
      .map((f) => ({
        id: f.id,
        source: f.source,
        target: f.target,
        name: f.name,
        condition: f.condition,
        isDefault: !!f.isDefault,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

const LINEAR = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Linear" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:task id="Activity_1" name="Task" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="999" y="3" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const SLICE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:foo="http://example.com/foo" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_review" name="Review" isExecutable="false">
    <bpmn:extensionElements>
      <foo:bar name="process-ext">keep</foo:bar>
    </bpmn:extensionElements>
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:task id="Activity_1" name="Review">
      <bpmn:extensionElements>
        <foo:bar name="task-ext" />
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:exclusiveGateway id="XorSplit" name="Approved?" default="Flow_no" />
    <bpmn:task id="YesTask" name="Yes" />
    <bpmn:task id="NoTask" name="No" />
    <bpmn:exclusiveGateway id="XorJoin" />
    <bpmn:parallelGateway id="AndSplit" />
    <bpmn:task id="A" name="A" />
    <bpmn:task id="B" name="B" />
    <bpmn:parallelGateway id="AndJoin" />
    <bpmn:inclusiveGateway id="OrSplit" />
    <bpmn:task id="C" name="C" />
    <bpmn:task id="D" name="D" />
    <bpmn:inclusiveGateway id="OrJoin" />
    <bpmn:endEvent id="EndEvent_1" name="Done" />
    <bpmn:sequenceFlow id="Flow_start" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_to_xor" sourceRef="Activity_1" targetRef="XorSplit" />
    <bpmn:sequenceFlow id="Flow_yes" name="Yes" sourceRef="XorSplit" targetRef="YesTask">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ok}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_no" name="No" sourceRef="XorSplit" targetRef="NoTask" />
    <bpmn:sequenceFlow id="Flow_yes_join" sourceRef="YesTask" targetRef="XorJoin" />
    <bpmn:sequenceFlow id="Flow_no_join" sourceRef="NoTask" targetRef="XorJoin" />
    <bpmn:sequenceFlow id="Flow_to_and" sourceRef="XorJoin" targetRef="AndSplit" />
    <bpmn:sequenceFlow id="Flow_and_a" sourceRef="AndSplit" targetRef="A" />
    <bpmn:sequenceFlow id="Flow_and_b" sourceRef="AndSplit" targetRef="B" />
    <bpmn:sequenceFlow id="Flow_a_join" sourceRef="A" targetRef="AndJoin" />
    <bpmn:sequenceFlow id="Flow_b_join" sourceRef="B" targetRef="AndJoin" />
    <bpmn:sequenceFlow id="Flow_to_or" sourceRef="AndJoin" targetRef="OrSplit" />
    <bpmn:sequenceFlow id="Flow_or_c" sourceRef="OrSplit" targetRef="C" />
    <bpmn:sequenceFlow id="Flow_or_d" sourceRef="OrSplit" targetRef="D" />
    <bpmn:sequenceFlow id="Flow_c_join" sourceRef="C" targetRef="OrJoin" />
    <bpmn:sequenceFlow id="Flow_d_join" sourceRef="D" targetRef="OrJoin" />
    <bpmn:sequenceFlow id="Flow_end" sourceRef="OrJoin" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const ADD_TASK_LAYOUT = {
  edges: {
    SequenceFlow_1: [
      { x: 120, y: 184 },
      { x: 216, y: 184 },
    ],
    SequenceFlow_2: [
      { x: 336, y: 184 },
      { x: 432, y: 184 },
    ],
  },
  labels: {
    EndEvent_1: { height: 24, width: 90, x: 407, y: 216 },
    StartEvent_1: { height: 24, width: 90, x: 55, y: 216 },
  },
  shapes: {
    EndEvent_1: { height: 40, width: 40, x: 432, y: 164 },
    StartEvent_1: { height: 40, width: 40, x: 80, y: 164 },
    Task_1: { height: 72, width: 120, x: 216, y: 148 },
  },
};

describe('XML ⇄ graph ⇄ XML', () => {
  it('round-trips ids/types/flows for the first slice', async () => {
    const g1 = await xmlToProcess(SLICE);
    expect(g1.nodes.map((n) => n.type).sort()).toEqual(
      [
        'end',
        'exclusiveGateway',
        'exclusiveGateway',
        'inclusiveGateway',
        'inclusiveGateway',
        'parallelGateway',
        'parallelGateway',
        'start',
        'task',
        'task',
        'task',
        'task',
        'task',
        'task',
        'task',
      ].sort(),
    );
    expect(g1.flows.find((f) => f.id === 'Flow_yes')?.condition).toBe('${ok}');
    expect(g1.flows.find((f) => f.id === 'Flow_no')?.isDefault).toBe(true);

    const xml2 = exportProcessXml(g1);
    const g2 = await xmlToProcess(xml2);
    expect(graphKey(g2)).toEqual(graphKey(g1));
    expect(exportProcessXml(g2)).toBe(xml2);
  });

  it('preserves extensionElements on process and task', async () => {
    const g1 = await xmlToProcess(SLICE);
    expect(g1.extensionElements?.[0]).toMatchObject({ $type: 'foo:bar', name: 'process-ext', $body: 'keep' });
    expect(g1.nodes.find((n) => n.id === 'Activity_1')?.extensionElements?.[0]).toMatchObject({
      $type: 'foo:bar',
      name: 'task-ext',
    });
    const g2 = await xmlToProcess(exportProcessXml(g1));
    expect(g2.extensionElements).toEqual(g1.extensionElements);
    expect(g2.nodes.find((n) => n.id === 'Activity_1')?.extensionElements).toEqual(
      g1.nodes.find((n) => n.id === 'Activity_1')?.extensionElements,
    );
    expect(exportProcessXml(g2)).toContain('foo:bar');
    expect(exportProcessXml(g2)).toContain('name="process-ext"');
    expect(exportProcessXml(g2)).toContain('>keep</foo:bar>');
  });

  it('ignores imported coordinates and lays out from the graph', async () => {
    const p = await xmlToProcess(LINEAR);
    const out = exportProcessXml(p);
    expect(out).not.toContain('x="999"');
    expect(out).toContain('width="120"');
    expect(out).toContain('height="72"');
  });
});

describe('graph → layoutProcess → DI', () => {
  it('matches the layout-engine addTask snapshot in XML DI', async () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    const di = layoutProcess(p);
    expect(di).toEqual(ADD_TASK_LAYOUT);
    expect(layoutProcess(p)).toEqual(di);
    const xml = exportProcessXml(p);
    expect(xml).toBe(exportProcessXml(p));
    expect(await readDiFromXml(xml)).toEqual(di);
    expect(xml).toContain('name="End"');
    expect(xml).toContain('name="Start"');
    expect(xml).toContain('bpmndi:BPMNLabel');
    expect(di.labels.EndEvent_1!.y).toBe(di.shapes.EndEvent_1!.y + di.shapes.EndEvent_1!.height + TOKENS.label.gap);
    expect(di.labels.StartEvent_1!.width).toBeGreaterThanOrEqual(TOKENS.label.width);
    expect(di.labels.StartEvent_1!.width).toBeGreaterThanOrEqual('Start'.length * TOKENS.label.charWidth);
  });

  it('writes End/Start names and BPMNLabel bounds so bpmn-js can show them', () => {
    const p = createProcess();
    const xml = exportProcessXml(p);
    expect(xml).toMatch(/<bpmn:endEvent id="EndEvent_1" name="End"/);
    expect(xml).toMatch(/<bpmn:startEvent id="StartEvent_1" name="Start"/);
    const endShape = xml.match(/<bpmndi:BPMNShape id="EndEvent_1_di"[\s\S]*?<\/bpmndi:BPMNShape>/)?.[0];
    const startShape = xml.match(/<bpmndi:BPMNShape id="StartEvent_1_di"[\s\S]*?<\/bpmndi:BPMNShape>/)?.[0];
    expect(endShape).toContain('bpmndi:BPMNLabel');
    expect(startShape).toContain('bpmndi:BPMNLabel');
    expect(endShape).toMatch(/width="90" height="24"/);
    expect(startShape).toMatch(/width="90" height="24"/);
    const di = layoutProcess(p);
    expect(di.labels.EndEvent_1!.y).toBe(di.shapes.EndEvent_1!.y + di.shapes.EndEvent_1!.height + 12);
    expect(di.labels.StartEvent_1!.width).toBeGreaterThanOrEqual(90);
  });

  it('fills missing Start/End names so labels still export', () => {
    const p = createProcess();
    const blank = {
      ...p,
      nodes: p.nodes.map((n) => (n.type === 'start' || n.type === 'end' ? { ...n, name: '' } : n)),
    };
    const xml = exportProcessXml(blank);
    expect(xml).toMatch(/<bpmn:startEvent id="StartEvent_1" name="Start"/);
    expect(xml).toMatch(/<bpmn:endEvent id="EndEvent_1" name="End"/);
    expect(xml).toContain('bpmndi:BPMNLabel');
  });

  it('writes XOR/AND/OR layout waypoints into DI', async () => {
    const afterStart = { after: 'StartEvent_1' };
    for (const split of [splitExclusive, splitParallel, splitInclusive]) {
      const p = split(createProcess(), afterStart).process;
      const xml = exportProcessXml(p);
      expect(await readDiFromXml(xml)).toEqual(layoutProcess(p));
      expect(graphKey(await xmlToProcess(xml))).toEqual(graphKey(p));
    }
  });

  it('round-trips pool, lane, and message flow', async () => {
    let p = createProcess({ name: 'Clerk' });
    p = addTask(p, { name: 'Review' }).process;
    p = addPool(p, { name: 'Partner' }).process;
    const host = p.participants[0]!.id;
    const partner = p.participants[1]!.id;
    p = addLane(p, { participantId: host, name: 'Ops' }).process;
    p = addMessageInteraction(p, { from: host, to: partner, name: 'Request' }).process;
    const xml = exportProcessXml(p);
    expect(xml).toContain('bpmn:collaboration');
    expect(xml).toContain('bpmn:participant');
    expect(xml).toContain('bpmn:lane');
    expect(xml).toContain('bpmn:messageFlow');
    expect(xml).toContain('processRef=');
    const g2 = await xmlToProcess(xml);
    expect(g2.participants.map((part) => ({ id: part.id, name: part.name, processId: part.processId }))).toEqual(
      p.participants.map((part) => ({ id: part.id, name: part.name, processId: part.processId })),
    );
    expect(g2.lanes.map((l) => ({ id: l.id, name: l.name, nodeIds: l.nodeIds }))).toEqual(
      p.lanes.map((l) => ({ id: l.id, name: l.name, nodeIds: l.nodeIds })),
    );
    expect(g2.messageFlows.map((m) => ({ id: m.id, source: m.source, target: m.target, name: m.name }))).toEqual(
      p.messageFlows.map((m) => ({ id: m.id, source: m.source, target: m.target, name: m.name })),
    );
    expect(graphKey(g2)).toEqual(graphKey(p));
    expect(await readDiFromXml(xml)).toEqual(layoutProcess(p));
    expect(exportProcessXml(g2)).toBe(xml);
  });

  it('round-trips an expanded subprocess and event subprocess', async () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    p = wrapInSubprocess(p, [p.nodes.find((n) => n.name === 'Review')!.id], { name: 'Inner' }).process;
    p = createEventSubprocess(p, { name: 'On timeout' }).process;
    const xml = exportProcessXml(p);
    expect(xml).toContain('bpmn:subProcess');
    expect(xml).toContain('triggeredByEvent="true"');
    expect(xml).toContain('isExpanded="true"');
    const g2 = await xmlToProcess(xml);
    expect(g2.nodes.filter((n) => n.type === 'subProcess')).toHaveLength(2);
    expect(g2.nodes.some((n) => n.triggeredByEvent)).toBe(true);
    expect(g2.regions.some((r) => r.type === 'subprocess')).toBe(true);
    expect(g2.regions.some((r) => r.type === 'eventSubprocess')).toBe(true);
    expect(graphKey(g2)).toEqual(graphKey(p));
    expect(await readDiFromXml(xml)).toEqual(layoutProcess(p));
    expect(exportProcessXml(g2)).toBe(xml);
  });

  it('writes DI for unmatched XOR branches that never join', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:exclusiveGateway id="Gateway_1" />
    <bpmn:endEvent id="End_yes" />
    <bpmn:endEvent id="End_no" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_yes" sourceRef="Gateway_1" targetRef="End_yes" />
    <bpmn:sequenceFlow id="Flow_no" sourceRef="Gateway_1" targetRef="End_no" />
  </bpmn:process>
</bpmn:definitions>`;
    const p = await xmlToProcess(xml);
    const out = exportProcessXml(p);
    expect(out.match(/<bpmndi:BPMNShape /g)?.length).toBe(p.nodes.length);
    expect(out.match(/<bpmndi:BPMNEdge /g)?.length).toBe(p.flows.length);
    expect(await readDiFromXml(out)).toEqual(layoutProcess(p));
  });
});

describe('workflow DTO (api-server)', () => {
  it('round-trips start/task/gateway/end and sequence flows', async () => {
    const xml = workflowToBpmn({
      processId: 'Process_review',
      nodes: [
        { id: 'StartEvent_1', type: 'startEvent', label: 'Start' },
        { id: 'Activity_1', type: 'task', label: 'Review' },
        { id: 'Gateway_1', type: 'exclusiveGateway', label: 'Approved?' },
        { id: 'EndEvent_yes', type: 'endEvent', label: 'Done' },
        { id: 'EndEvent_no', type: 'endEvent', label: 'Reject' },
      ],
      edges: [
        { id: 'Flow_1', source: 'StartEvent_1', target: 'Activity_1' },
        { id: 'Flow_2', source: 'Activity_1', target: 'Gateway_1' },
        { id: 'Flow_yes', source: 'Gateway_1', target: 'EndEvent_yes', label: 'Yes', condition: '${ok}' },
        { id: 'Flow_no', source: 'Gateway_1', target: 'EndEvent_no', label: 'No' },
      ],
    });
    expect(xml).toContain('bpmn:startEvent');
    expect(xml).toContain('bpmn:exclusiveGateway');
    expect(xml).toContain('${ok}');
    const parsed = await bpmnToWorkflow(xml);
    expect(parsed.processId).toBe('Process_review');
    expect(parsed.nodes.map((node) => node.id).sort()).toEqual(
      ['Activity_1', 'EndEvent_no', 'EndEvent_yes', 'Gateway_1', 'StartEvent_1'].sort(),
    );
    expect(parsed.nodes.find((n) => n.id === 'Gateway_1')?.type).toBe('exclusiveGateway');
    expect(parsed.edges).toHaveLength(4);
    expect(parsed.edges.find((edge) => edge.id === 'Flow_yes')).toMatchObject({
      label: 'Yes',
      condition: '${ok}',
    });
  });

  it('parses an empty process as an empty workflow', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" />
</bpmn:definitions>`;
    expect(await bpmnToWorkflow(xml)).toEqual({ processId: 'Process_1', nodes: [], edges: [] });
  });
});

const STRESS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../fixtures/insurance-claim-stress.bpmn'), 'utf8');

function tagCount(xml: string, local: string): number {
  return xml.match(new RegExp(`<(?:[\\w.-]+:)?${local}[\\s>/]`, 'g'))?.length ?? 0;
}

function attrCount(xml: string, name: string): number {
  return xml.match(new RegExp(`${name}="`, 'g'))?.length ?? 0;
}

function stressCounters(xml: string) {
  return {
    documentation: tagCount(xml, 'documentation'),
    dataObject: tagCount(xml, 'dataObject'),
    dataStore: tagCount(xml, 'dataStore'),
    textAnnotation: tagCount(xml, 'textAnnotation'),
    association: tagCount(xml, 'association'),
    group: tagCount(xml, 'group'),
    multiInstanceLoopCharacteristics: tagCount(xml, 'multiInstanceLoopCharacteristics'),
    script: tagCount(xml, 'script'),
    message: tagCount(xml, 'message'),
    error: tagCount(xml, 'error'),
    signal: tagCount(xml, 'signal'),
    escalation: tagCount(xml, 'escalation'),
    targetNamespace: /targetNamespace="http:\/\/acme-insurance\.example"/.test(xml),
    isExecutableTrue: /isExecutable="true"/.test(xml),
    messageRef: attrCount(xml, 'messageRef'),
    errorRef: attrCount(xml, 'errorRef'),
    timeDuration: tagCount(xml, 'timeDuration'),
    P5D: xml.includes('P5D'),
    PT48H: xml.includes('PT48H'),
    calledElement: attrCount(xml, 'calledElement'),
    camundaTopic: attrCount(xml, 'camunda:topic'),
    camundaType: attrCount(xml, 'camunda:type'),
    camundaAssignee: attrCount(xml, 'camunda:assignee'),
    camundaDecisionRef: attrCount(xml, 'camunda:decisionRef'),
    isInterrupting: attrCount(xml, 'isInterrupting'),
    scriptFormat: attrCount(xml, 'scriptFormat'),
    ordering: attrCount(xml, 'ordering'),
    exporter: attrCount(xml, 'exporter'),
    extensionElements: tagCount(xml, 'extensionElements'),
    dataStoreRef: attrCount(xml, 'dataStoreRef'),
    categoryValueRef: attrCount(xml, 'categoryValueRef'),
  };
}

describe('import → rename → save keeps Camunda-ish extras', () => {
  it('preserves dropped tags/attrs after one semantic rename', async () => {
    const before = stressCounters(STRESS);
    expect(before).toMatchObject({
      documentation: 2,
      dataObject: 1,
      dataStore: 1,
      textAnnotation: 1,
      association: 1,
      group: 1,
      multiInstanceLoopCharacteristics: 1,
      script: 1,
      message: 3,
      error: 1,
      signal: 1,
      escalation: 1,
      targetNamespace: true,
      isExecutableTrue: true,
      messageRef: 1,
      errorRef: 3,
      timeDuration: 2,
      P5D: true,
      PT48H: true,
      calledElement: 1,
      camundaTopic: 1,
      camundaType: 1,
      camundaAssignee: 1,
      camundaDecisionRef: 1,
      isInterrupting: 1,
      scriptFormat: 1,
      ordering: 1,
      exporter: 1,
      extensionElements: 1,
      dataStoreRef: 1,
      categoryValueRef: 1,
    });

    const g1 = await xmlToProcess(STRESS);
    const renamed = renameElement(g1, 'Task_Register', 'Register claim v2').process;
    const saved = exportProcessXml(renamed);
    const after = stressCounters(saved);

    expect(after).toEqual(before);
    expect(saved).toContain('Register claim v2');
    expect(saved).not.toContain('x="9999"');
    expect(saved).toContain('camunda:inputParameter');
    expect(saved).toMatch(/bpmnElement="DO_Claim"/);
    expect(saved).toMatch(/bpmnElement="DS_Claims"/);
    expect(saved).toMatch(/bpmnElement="Note_1"/);
    expect(saved).toMatch(/bpmnElement="G_1"/);
    expect(saved).toMatch(/bpmnElement="As_1"/);
    expect(await xmlToProcess(saved).then((g) => g.nodes.find((n) => n.id === 'Task_Register')?.name)).toBe(
      'Register claim v2',
    );
  });
});
