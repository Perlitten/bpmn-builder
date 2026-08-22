import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutProcess } from '@bpmn/layout-engine';
import type { FlowNode, SemanticProcess, ProcessGraph, SequenceFlow } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { exportProcessXml, readDiFromXml, xmlToProcess } from '@bpmn/bpmn-adapter';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const CASES = ['A.1.0.bpmn', 'A.2.0.bpmn', 'C.1.0.bpmn'] as const;

function load(name: (typeof CASES)[number]): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function nodeKey(n: FlowNode) {
  return {
    id: n.id,
    type: n.type,
    name: n.name,
    bpmnType: n.bpmnType,
    ...(n.eventDefinition ? { eventDefinition: n.eventDefinition } : {}),
    ...(n.attachedTo ? { attachedTo: n.attachedTo } : {}),
  };
}

function flowKey(f: SequenceFlow) {
  return {
    id: f.id,
    source: f.source,
    target: f.target,
    name: f.name,
    condition: f.condition,
    isDefault: !!f.isDefault,
  };
}

function graphKey(g: Pick<ProcessGraph, 'id' | 'name' | 'nodes' | 'flows'>) {
  return {
    id: g.id,
    name: g.name,
    nodes: [...g.nodes].map(nodeKey).sort((a, b) => a.id.localeCompare(b.id)),
    flows: [...g.flows].map(flowKey).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Semantic graph without DI / generated region ids. */
function semanticGraph(p: SemanticProcess) {
  return {
    ...graphKey(p),
    collaborationId: p.collaborationId,
    participants: [...p.participants]
      .map((part) => ({ id: part.id, name: part.name, processId: part.processId }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    lanes: [...p.lanes]
      .map((l) => ({
        id: l.id,
        name: l.name,
        processId: l.processId,
        participantId: l.participantId,
        nodeIds: [...l.nodeIds].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    messageFlows: [...p.messageFlows]
      .map((m) => ({ id: m.id, source: m.source, target: m.target, name: m.name }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    processes: [...p.processes].map(graphKey).sort((a, b) => a.id.localeCompare(b.id)),
    regions: p.regions.map((r) => ({
      type: r.type,
      split: r.split,
      join: r.join,
      branches: r.branches.map((b) => ({ entryFlowId: b.entryFlowId, nodeIds: [...b.nodeIds] })),
    })),
  };
}

describe('@bpmn/bpmn-adapter MIWG-inspired round-trip', () => {
  it('uses local A.1 / A.2 / C.1 fixtures (no network download)', () => {
    const names = readdirSync(FIXTURES).filter((f) => f.endsWith('.bpmn'));
    expect(CASES.every((name) => names.includes(name))).toBe(true);
  });

  it.each(CASES)('%s: import → graph → export → import is semantically equivalent; layout is deterministic', async (name) => {
    const xml1 = load(name);
    const g1 = await xmlToProcess(xml1);
    const xml2 = exportProcessXml(g1);
    const g2 = await xmlToProcess(xml2);
    const xml3 = exportProcessXml(g2);

    expect(semanticGraph(g2)).toEqual(semanticGraph(g1));
    expect(xml2).toBe(xml3);
    expect(exportProcessXml(g1)).toBe(xml2);

    const di1 = layoutProcess(g1);
    const di2 = layoutProcess(g2);
    expect(di1).toEqual(di2);
    expect(layoutProcess(g1)).toEqual(di1);
    expect(await readDiFromXml(xml2)).toEqual(di1);
    expect(await readDiFromXml(xml3)).toEqual(di2);

    expect(xml1).toContain('x="9999"');
    expect(xml2).not.toContain('x="9999"');
    expect(xml2).not.toContain('y="1"');
  });

  it('A.1.0 is start → task → end', async () => {
    const g = await xmlToProcess(load('A.1.0.bpmn'));
    expect(g.nodes.map((n) => n.type)).toEqual(['start', 'task', 'end']);
    expect(g.flows).toHaveLength(2);
    expect(g.participants).toHaveLength(0);
  });

  it('A.2.0 keeps XOR split/join, default, and condition', async () => {
    const g = await xmlToProcess(load('A.2.0.bpmn'));
    expect(g.nodes.filter((n) => n.type === 'exclusiveGateway')).toHaveLength(2);
    expect(g.flows.find((f) => f.id === 'Flow_yes')?.condition).toBe('${approved}');
    expect(g.flows.find((f) => f.id === 'Flow_no')?.isDefault).toBe(true);
    expect(g.regions).toEqual([
      expect.objectContaining({
        type: 'exclusive',
        split: 'Gateway_1',
        join: 'Gateway_2',
      }),
    ]);
  });

  it('C.1.0 keeps collaboration, peer process, and message flow', async () => {
    const g = await xmlToProcess(load('C.1.0.bpmn'));
    expect(g.collaborationId).toBe('Collaboration_1');
    expect(g.participants.map((p) => ({ id: p.id, processId: p.processId }))).toEqual([
      { id: 'Participant_1', processId: 'Process_1' },
      { id: 'Participant_2', processId: 'Process_2' },
    ]);
    expect(g.messageFlows).toEqual([
      expect.objectContaining({ id: 'MessageFlow_1', source: 'Task_1', target: 'Task_2', name: 'Request' }),
    ]);
    expect(g.processes).toHaveLength(1);
    expect(g.processes[0]?.id).toBe('Process_2');
    expect(g.processes[0]?.nodes.map((n) => n.id).sort()).toEqual(['EndEvent_2', 'StartEvent_2', 'Task_2']);
  });
});
