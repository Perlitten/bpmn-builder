import { readFileSync } from 'node:fs';
import { exportProcessXml } from '@bpmn/bpmn-adapter';
import { layoutProcess } from '@bpmn/layout-engine';
import { addTask, createProcess, happyPathIds, splitExclusive } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { createSemanticEditor, MODELER_REMOUNT_KEYS, createIntoLane, createdLaneTargets } from './session';

describe('semantic editor session', () => {
  it('does not remount the modeler when autosave xml changes', () => {
    expect(MODELER_REMOUNT_KEYS).toEqual(['processId']);
    expect(MODELER_REMOUNT_KEYS).not.toContain('xml');
  });

  it('addTask via op then layout snapshot is stable and written as DI', async () => {
    const imports: string[] = [];
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(createProcess()),
    );
    const first = await editor.create('activity.task');
    const second = editor.xml();
    expect(first.xml).toBe(second);
    expect(first.xml).toContain('<dc:Bounds');
    expect(first.xml).toContain('bpmn:task');
    expect(first.xml).toMatch(/<bpmn:endEvent id="EndEvent_1" name="End"/);
    expect(first.xml).toContain('bpmndi:BPMNLabel');
    expect(imports).toHaveLength(1);
    expect(imports[0]).toBe(first.xml);
  });

  it('rename updates the graph without a second import (no remount per keystroke)', async () => {
    const imports: string[] = [];
    const labels: Array<[string, string]> = [];
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
        updateLabel: (id, name) => {
          labels.push([id, name]);
        },
      },
      exportProcessXml(p),
    );
    const task = editor.process().nodes.find((n) => n.type === 'task')!;
    const xml = editor.rename(task.id, 'Review request');
    expect(imports).toHaveLength(0);
    expect(labels).toEqual([[task.id, 'Review request']]);
    expect(xml).toContain('Review request');
    expect(editor.process().nodes.find((n) => n.id === task.id)?.name).toBe('Review request');
  });

  it('requests a canvas fit on first import and add pool/lane, not on task or rename', async () => {
    const fits: boolean[] = [];
    const editor = await createSemanticEditor(
      {
        importXml: async (_xml, _select, options) => {
          fits.push(options?.fit === true);
        },
        updateLabel: () => {},
      },
      exportProcessXml(createProcess()),
    );
    await editor.bootstrap();
    expect(fits).toEqual([true]);

    await editor.create('activity.task');
    expect(fits.at(-1)).toBe(false);

    const task = editor.process().nodes.find((n) => n.type === 'task')!;
    editor.rename(task.id, 'Review request');
    expect(fits).toHaveLength(2);

    await editor.create('participant.pool');
    expect(fits.at(-1)).toBe(true);

    await editor.create('participant.lane');
    expect(fits.at(-1)).toBe(true);

    await editor.create('activity.task');
    expect(fits.at(-1)).toBe(false);

    await editor.undo();
    expect(fits.at(-1)).toBe(false);
    await editor.undo();
    expect(fits.at(-1)).toBe(true);
  });

  it('drop reorders via moveAfter then writes canonical DI', async () => {
    const imports: string[] = [];
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = addTask(p, { name: 'B' }).process;
    p = addTask(p, { name: 'C' }).process;
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(p),
    );
    const named = (name: string) => editor.process().nodes.find((n) => n.name === name)!;
    const a = named('A');
    const c = named('C');
    const box = layoutProcess(editor.process()).shapes[a.id]!;
    await editor.drop(c.id, { x: box.x + box.width + 10, y: box.y + box.height / 2 });
    expect(happyPathIds(editor.process()).map((id) => editor.process().nodes.find((n) => n.id === id)!.name)).toEqual([
      'Start',
      'A',
      'C',
      'B',
      'End',
    ]);
    expect(imports.at(-1)).toContain('<dc:Bounds');
  });

  it('drop onto the other XOR band uses moveToBranch then writes canonical DI', async () => {
    const imports: string[] = [];
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: p.nodes.find((n) => n.name === 'A')!.id }).process;
    const yes = p.regions[0]!.branches[0]!;
    const no = p.regions[0]!.branches[1]!;
    p = addTask(p, { name: 'Yes', branchId: yes.id }).process;
    p = addTask(p, { name: 'No', branchId: no.id }).process;
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(p),
    );
    const yesTask = editor.process().nodes.find((n) => n.name === 'Yes')!;
    const noTask = editor.process().nodes.find((n) => n.name === 'No')!;
    const box = layoutProcess(editor.process()).shapes[noTask.id]!;
    await editor.drop(yesTask.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const region = editor.process().regions[0]!;
    const names = (ids: string[]) => ids.map((id) => editor.process().nodes.find((n) => n.id === id)!.name);
    expect(names(region.branches[1]!.nodeIds)).toEqual(['Yes', 'No']);
    expect(names(region.branches[0]!.nodeIds)).toEqual([]);
    expect(imports.at(-1)).toContain('<dc:Bounds');
  });

  it('drop onto a lane uses assignLane; drop on a node in a lane also reorders', async () => {
    const imports: string[] = [];
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(createProcess()),
    );
    const a = await editor.create('activity.task');
    editor.rename(a.id, 'A');
    const b = await editor.create('activity.task');
    editor.rename(b.id, 'B');
    await editor.create('participant.lane');
    await editor.create('participant.lane');
    const clerk = editor.process().lanes[0]!;
    const manager = editor.process().lanes[1]!;
    await editor.assignLane(b.id, manager.id);

    const managerBox = layoutProcess(editor.process()).shapes[manager.id]!;
    await editor.drop(a.id, {
      x: managerBox.x + managerBox.width / 2,
      y: managerBox.y + managerBox.height / 2,
    });
    expect(editor.process().lanes.find((lane) => lane.id === manager.id)!.nodeIds).toContain(a.id);
    expect(editor.process().lanes.find((lane) => lane.id === clerk.id)!.nodeIds).not.toContain(a.id);

    await editor.assignLane(a.id, clerk.id);
    const bBox = layoutProcess(editor.process()).shapes[b.id]!;
    await editor.drop(a.id, { x: bBox.x + bBox.width / 2, y: bBox.y + bBox.height / 2 });
    expect(editor.process().lanes.find((lane) => lane.id === manager.id)!.nodeIds).toContain(a.id);
    expect(imports.at(-1)).toContain('<dc:Bounds');
  });

  it('applyPlan splitExclusive then layout writes DI, not a raw XML swap', async () => {
    const imports: string[] = [];
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(p),
    );
    const after = editor.process().nodes.find((n) => n.name === 'Review')!.id;
    const xml = await editor.applyPlan([
      {
        name: 'splitExclusive',
        args: { after, name: 'Approved?', branches: [{ name: 'Yes' }, { name: 'No' }] },
      },
    ]);
    expect(editor.process().regions[0]!.branches.map((b) => b.name)).toEqual(['Yes', 'No']);
    expect(xml).toContain('exclusiveGateway');
    expect(xml).toContain('<dc:Bounds');
    expect(imports.at(-1)).toBe(xml);
  });

  it('applyProcess layouts the returned graph the same way as create', async () => {
    const imports: string[] = [];
    const origin = createProcess();
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(origin),
    );
    let next = addTask(origin, { name: 'Review' }).process;
    next = splitExclusive(next, { after: next.nodes.find((n) => n.name === 'Review')!.id }).process;
    const xml = await editor.applyProcess(next, next.regions[0]!.id);
    expect(editor.process().regions).toHaveLength(1);
    expect(xml).toContain('exclusiveGateway');
    expect(xml).toContain('<dc:Bounds');
    expect(imports.at(-1)).toBe(xml);
  });

  it('rolls back the last good graph when importXml fails', async () => {
    const origin = createProcess();
    let imports = 0;
    const editor = await createSemanticEditor(
      {
        importXml: async () => {
          imports += 1;
          if (imports === 1) throw new Error("Cannot read properties of undefined (reading 'root-0')");
        },
      },
      exportProcessXml(origin),
    );
    const before = editor.process();
    await expect(
      editor.applyProcess(addTask(origin, { name: 'Review' }).process),
    ).rejects.toMatchObject({ name: 'DiagramImportError' });
    expect(editor.process()).toBe(before);
    expect(editor.process().nodes.some((n) => n.name === 'Review')).toBe(false);
  });

  it('copy then paste inserts two tasks via the session and writes canonical DI', async () => {
    const imports: string[] = [];
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = addTask(p, { name: 'B' }).process;
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(p),
    );
    const a = editor.process().nodes.find((n) => n.name === 'A')!;
    const b = editor.process().nodes.find((n) => n.name === 'B')!;
    expect(editor.copy([a.id, b.id])).not.toBeNull();
    const xml = await editor.paste();
    expect(xml).toBeTruthy();
    expect(editor.process().nodes.filter((n) => n.name === 'A')).toHaveLength(2);
    expect(editor.process().nodes.filter((n) => n.name === 'B')).toHaveLength(2);
    expect(happyPathIds(editor.process()).map((id) => editor.process().nodes.find((n) => n.id === id)!.name)).toEqual([
      'Start',
      'A',
      'B',
      'A',
      'B',
      'End',
    ]);
    expect(xml).toContain('<dc:Bounds');
    expect(imports.at(-1)).toBe(xml);
  });

  it('undo restores the graph after create', async () => {
    const imports: string[] = [];
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(createProcess()),
    );
    const before = editor.process().nodes.map((n) => n.id).sort();
    expect(editor.canUndo()).toBe(false);
    await editor.create('activity.task');
    expect(editor.canUndo()).toBe(true);
    expect(editor.process().nodes.some((n) => n.type === 'task')).toBe(true);
    const xml = await editor.undo();
    expect(editor.process().nodes.map((n) => n.id).sort()).toEqual(before);
    expect(editor.process().nodes.some((n) => n.type === 'task')).toBe(false);
    expect(xml).toContain('StartEvent_1');
    expect(editor.canRedo()).toBe(true);
    await editor.redo();
    expect(editor.process().nodes.some((n) => n.type === 'task')).toBe(true);
    expect(imports.length).toBeGreaterThanOrEqual(3);
  });

  it('create participant.lane on a selected pool adds a lane there, not a partner', async () => {
    const selected: Array<string | string[] | undefined> = [];
    const editor = await createSemanticEditor(
      {
        importXml: async (_xml, selectId) => {
          selected.push(selectId);
        },
      },
      exportProcessXml(createProcess()),
    );
    await editor.create('participant.pool');
    expect(editor.process().participants).toHaveLength(2);
    expect(editor.process().lanes).toHaveLength(0);
    const host = editor.process().participants[0]!;
    const partner = editor.process().participants[1]!;

    const onPartner = await editor.create('participant.lane', partner.id);
    expect(editor.process().participants).toHaveLength(2);
    expect(editor.process().lanes).toHaveLength(1);
    expect(editor.process().lanes[0]).toMatchObject({ id: onPartner.id, participantId: partner.id });
    expect(selected.at(-1)).toBe(partner.id);
    expect(onPartner.xml).toMatch(/bpmn:lane/i);

    const onHost = await editor.create('participant.lane', host.id);
    expect(editor.process().participants).toHaveLength(2);
    expect(editor.process().lanes.map((lane) => lane.participantId)).toEqual([partner.id, host.id]);
    expect(selected.at(-1)).toBe(host.id);

    editor.rename(onPartner.id, 'Treasury');
    editor.rename(onHost.id, 'Clerk');
    expect(editor.process().lanes.map((lane) => lane.name)).toEqual(['Treasury', 'Clerk']);
  });

  it('assignLane moves a task between lanes and create into a lane uses the same op', async () => {
    const imports: string[] = [];
    const editor = await createSemanticEditor(
      {
        importXml: async (xml) => {
          imports.push(xml);
        },
      },
      exportProcessXml(createProcess()),
    );
    const task = await editor.create('activity.task');
    await editor.create('participant.lane');
    await editor.create('participant.lane');
    const [clerk, manager] = editor.process().lanes;
    expect(clerk).toBeDefined();
    expect(manager).toBeDefined();
    expect(clerk!.nodeIds).toContain(task.id);
    expect(manager!.nodeIds).toEqual([]);

    const xml = await editor.assignLane(task.id, manager!.id);
    expect(editor.process().lanes[0]!.nodeIds).not.toContain(task.id);
    expect(editor.process().lanes[1]!.nodeIds).toEqual([task.id]);
    expect(xml).toContain('<dc:Bounds');
    expect(imports.at(-1)).toBe(xml);

    const placed = await editor.create('activity.userTask', manager!.id);
    expect(editor.process().lanes[1]!.nodeIds).toContain(placed.id);
    expect(editor.process().nodes.find((node) => node.id === placed.id)?.bpmnType).toBe('bpmn:UserTask');

    const xor = await editor.create('gateway.exclusive', manager!.id);
    const region = editor.process().regions[0]!;
    expect(xor.id).toBe(region.id);
    expect(createdLaneTargets(editor.process(), xor.id).sort()).toEqual([region.split, region.join].sort());
    expect(editor.process().lanes[1]!.nodeIds).toEqual(expect.arrayContaining([region.split, region.join]));
    expect(editor.process().lanes[0]!.nodeIds).not.toContain(region.split);
    expect(editor.process().lanes[0]!.nodeIds).not.toContain(region.join);

    const third = await editor.create('participant.lane', clerk!.id);
    expect(editor.process().lanes).toHaveLength(3);
    expect(editor.process().lanes.find((lane) => lane.id === third.id)).toMatchObject({
      participantId: clerk!.participantId,
    });
    expect(editor.process().lanes.find((lane) => lane.id === third.id)?.parentLaneId).toBeUndefined();
  });

  it('createIntoLane assigns flow nodes; Add lane on a lane stays a sibling after', () => {
    let process = createProcess();
    process = {
      ...process,
      lanes: [{ id: 'Lane_1', name: 'Clerk', processId: process.id, nodeIds: [] }],
    };
    expect(createIntoLane(process, 'activity.task', 'Lane_1')).toEqual({ laneId: 'Lane_1' });
    expect(createIntoLane(process, 'gateway.exclusive', 'Lane_1')).toEqual({ laneId: 'Lane_1' });
    expect(createIntoLane(process, 'boundary.timer', 'Lane_1')).toEqual({});
    expect(createIntoLane(process, 'participant.lane', 'Lane_1')).toEqual({ after: 'Lane_1' });
    expect(createIntoLane(process, 'activity.task', 'StartEvent_1')).toEqual({ after: 'StartEvent_1' });
  });

  it('addLane ×3, rename, click-only rename, and reload keep lane count and names', async () => {
    const editor = await createSemanticEditor(
      { importXml: async () => {} },
      exportProcessXml(createProcess()),
    );
    await editor.create('participant.lane');
    await editor.create('participant.lane');
    await editor.create('participant.lane');
    const [front, adjuster, finance] = editor.process().lanes;
    expect(editor.process().lanes).toHaveLength(3);
    editor.rename(front!.id, 'Front Office');
    editor.rename(adjuster!.id, 'Claims Adjuster');
    editor.rename(finance!.id, 'Finance');
    const tasksBefore = editor.process().nodes.filter((node) => node.type === 'task').length;
    editor.rename(adjuster!.id, 'Claims Adjuster');
    expect(editor.process().lanes.map((lane) => lane.name)).toEqual([
      'Front Office',
      'Claims Adjuster',
      'Finance',
    ]);
    expect(editor.process().nodes.filter((node) => node.type === 'task')).toHaveLength(tasksBefore);

    const xml = editor.xml();
    const reloaded = await createSemanticEditor({ importXml: async () => {} }, xml);
    expect(reloaded.process().lanes.map((lane) => lane.name)).toEqual([
      'Front Office',
      'Claims Adjuster',
      'Finance',
    ]);
    expect(reloaded.process().participants).toHaveLength(1);
    expect(reloaded.process().nodes.filter((node) => node.type === 'task')).toHaveLength(tasksBefore);
  });
});

describe('semantic editor preserved fields', () => {
  it('edits documentation and Camunda topic without dropping the other extras', async () => {
    const xml = readFileSync(
      new URL('../../../../../../packages/bpmn-adapter/fixtures/insurance-claim-stress.bpmn', import.meta.url),
      'utf8',
    );
    const editor = await createSemanticEditor({ importXml: async () => undefined }, xml);
    await editor.setDocumentation('Task_Policy', 'Load policy v2');
    await editor.setPreserveAttr('Task_Policy', 'camunda:topic', 'claim-intake-v2');
    await editor.setCalledElement('Call_Payment', 'RefundProc');
    await editor.setIsExecutable(true);
    const saved = editor.xml();
    expect(saved).toContain('Load policy v2');
    expect(saved).toContain('camunda:topic="claim-intake-v2"');
    expect(saved).toContain('calledElement="RefundProc"');
    expect(saved).toContain('isExecutable="true"');
    expect(saved).toContain('camunda:assignee="${assignee}"');
    expect(saved).toContain('<bpmn:timeDuration>P5D</bpmn:timeDuration>');
  });
});
