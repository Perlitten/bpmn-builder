import {
  addLane,
  addTask,
  assignLane,
  createFromComponent,
  createProcess,
  renameElement,
} from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { exportProcessXml, readDiFromXml, xmlToProcess } from './semantic-xml.js';

async function reload(process: Parameters<typeof exportProcessXml>[0]) {
  return xmlToProcess(exportProcessXml(process));
}

describe('lane / pool XML round-trip', () => {
  it('keeps three named sibling lanes and flowNodeRef across export, rename, and reload', async () => {
    let p = createProcess({ name: 'Insurance Claim' });
    p = addTask(p, { name: 'Register claim' }).process;
    p = addLane(p, { name: 'Lane' }).process;
    p = addLane(p, { name: 'Lane' }).process;
    p = addLane(p, { name: 'Lane' }).process;
    p = renameElement(p, p.lanes[0]!.id, 'Front Office').process;
    p = renameElement(p, p.lanes[1]!.id, 'Claims Adjuster').process;
    p = renameElement(p, p.lanes[2]!.id, 'Finance').process;
    p = renameElement(p, p.participants[0]!.id, 'Insurance Company').process;

    const xml = exportProcessXml(p);
    expect(xml.match(/<bpmn:lane /g)?.length).toBe(3);
    expect(xml).toContain('name="Front Office"');
    expect(xml).toContain('name="Claims Adjuster"');
    expect(xml).toContain('name="Finance"');
    expect(xml).toContain('flowNodeRef');

    const once = await xmlToProcess(xml);
    expect(once.lanes.map((lane) => lane.name)).toEqual(['Front Office', 'Claims Adjuster', 'Finance']);
    expect(once.lanes.every((lane) => !lane.parentLaneId)).toBe(true);
    expect(once.participants[0]!.name).toBe('Insurance Company');
    expect(once.lanes[0]!.nodeIds).toEqual(expect.arrayContaining(p.lanes[0]!.nodeIds));
    expect(once.nodes.filter((node) => node.type === 'task')).toHaveLength(1);

    const twice = await reload(once);
    expect(twice.lanes.map((lane) => lane.name)).toEqual(['Front Office', 'Claims Adjuster', 'Finance']);
    expect(twice.nodes.filter((node) => node.type === 'task')).toHaveLength(1);
  });

  it('parses a single-lane process with one flowNodeRef instead of dropping the lane', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Insurance Company" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" name="Claim" isExecutable="false">
    <bpmn:laneSet id="LaneSet_Process_1">
      <bpmn:lane id="Lane_1" name="Front Office">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="SequenceFlow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;
    const p = await xmlToProcess(xml);
    expect(p.lanes).toHaveLength(1);
    expect(p.lanes[0]).toMatchObject({ name: 'Front Office', nodeIds: ['StartEvent_1'] });
    expect(p.participants).toHaveLength(1);
    const back = await reload(p);
    expect(back.lanes.map((lane) => lane.name)).toEqual(['Front Office']);
    expect(back.lanes[0]!.nodeIds).toContain('StartEvent_1');
  });

  it('does not lose a nested child lane on save/reload, and Add lane after a lane stays siblings in XML', async () => {
    let nested = createProcess();
    nested = addLane(nested, { name: 'Front Office' }).process;
    nested = addLane(nested, { parentLaneId: nested.lanes[0]!.id, name: 'Finance' }).process;
    expect(nested.lanes).toHaveLength(2);
    const nestedReload = await reload(nested);
    expect(nestedReload.lanes.map((lane) => lane.name).sort()).toEqual(['Finance', 'Front Office']);
    expect(nestedReload.lanes.some((lane) => lane.parentLaneId === nestedReload.lanes.find((item) => item.name === 'Front Office')?.id)).toBe(
      true,
    );

    let siblings = createProcess();
    siblings = createFromComponent(siblings, 'participant.lane', { name: 'Front Office' }).process;
    siblings = createFromComponent(siblings, 'participant.lane', {
      after: siblings.lanes[0]!.id,
      name: 'Claims Adjuster',
    }).process;
    const xml = exportProcessXml(siblings);
    expect(xml).not.toMatch(/childLaneSet/i);
    const loaded = await xmlToProcess(xml);
    expect(loaded.lanes.map((lane) => lane.name)).toEqual(['Front Office', 'Claims Adjuster']);
    expect(loaded.lanes.every((lane) => !lane.parentLaneId)).toBe(true);
  });

  it('keeps sequence flows when connected tasks are assigned across lanes', async () => {
    let process = createProcess({ name: 'Approval' });
    process = addTask(process, { name: 'Submit request' }).process;
    process = addTask(process, { name: 'Review request' }).process;
    process = addLane(process, { name: 'Requester' }).process;
    process = addLane(process, { name: 'Approver' }).process;
    const review = process.nodes.find((node) => node.name === 'Review request')!;
    process = assignLane(process, review.id, process.lanes[1]!.id).process;

    const expectedFlows = process.flows.map((flow) => [flow.source, flow.target]);
    const xml = exportProcessXml(process);
    const loaded = await xmlToProcess(xml);
    const di = await readDiFromXml(xml);

    expect(loaded.flows.map((flow) => [flow.source, flow.target])).toEqual(expectedFlows);
    expect(Object.keys(di.edges).sort()).toEqual(process.flows.map((flow) => flow.id).sort());
    expect(loaded.lanes.find((lane) => lane.name === 'Approver')?.nodeIds).toContain(review.id);
  });
});
