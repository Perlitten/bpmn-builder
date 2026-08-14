import { exportProcessXml } from '@bpmn/bpmn-adapter';
import { layoutProcess } from '@bpmn/layout-engine';
import { addTask, createProcess, happyPathIds, splitExclusive } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { createSemanticEditor, MODELER_REMOUNT_KEYS } from './session';

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
});
