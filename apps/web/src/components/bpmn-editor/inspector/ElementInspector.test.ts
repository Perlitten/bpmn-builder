import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { exportProcessXml, xmlToProcess } from '@bpmn/bpmn-adapter';
import type { LintResult } from '@bpmn/rules';
import { createProcess } from '@bpmn/semantic-core';
import { ElementInspector } from './ElementInspector';
import { createInspectorCreateGate } from './inspectorCreateGesture';
import { lanesInPool, type PoolLaneRow } from './inspectorModel';
import type { DiagramElement } from '../diagramElement';
import { createSemanticEditor } from '../semantic/session';

const emptyLint: LintResult = {
  errors: [],
  warnings: [],
  style: [],
  suggestions: [],
  scores: { bpmn: 100, style: 100, quality: 100 },
  layout: 'none',
  executionProfile: 'none',
};

const pool: DiagramElement = {
  id: 'Participant_1',
  type: 'bpmn:Participant',
  businessObject: { $type: 'bpmn:Participant', name: 'Bank' },
};

const task: DiagramElement = {
  id: 'Activity_1',
  type: 'bpmn:Task',
  businessObject: { $type: 'bpmn:Task', name: 'Review' },
};

const noop = () => undefined;

function renderInspector(
  element: DiagramElement,
  onCreate = noop,
  poolLanes: PoolLaneRow[] = [],
  extras: {
    nodeLanes?: PoolLaneRow[];
    currentLaneId?: string;
    onAssignLane?: (laneId: string) => void;
  } = {},
) {
  return renderToStaticMarkup(
    createElement(ElementInspector, {
      element,
      canDelete: true,
      lint: emptyLint,
      replaceWorks: () => true,
      onRename: noop,
      onChangeTo: noop,
      onDelete: noop,
      onFlowKind: noop,
      onCondition: noop,
      onDefaultOutgoing: noop,
      onAttach: noop,
      onCreate,
      poolLanes,
      nodeLanes: extras.nodeLanes,
      currentLaneId: extras.currentLaneId,
      onAssignLane: extras.onAssignLane,
    }),
  );
}

describe('ElementInspector Add lane', () => {
  it('does not call create when a pool is selected (mount / render)', () => {
    const onCreate = vi.fn();
    const html = renderInspector(pool, onCreate);
    expect(onCreate).not.toHaveBeenCalled();
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="Add lane to this pool"/);
    expect(html).toMatch(/class="element-inspector-action"/);
    expect(html).not.toContain('element-inspector-attach');
    expect(html).toContain('Add lane');
    expect(html).toContain('No lanes yet');
    expect(html).not.toContain('aria-label="Lane name"');
  });

  it('lists each lane with a name field after two creates', () => {
    const html = renderInspector(pool, noop, [
      { id: 'Lane_1', name: 'Clerk' },
      { id: 'Lane_2', name: 'Manager' },
    ]);
    expect(html).not.toContain('No lanes yet');
    expect(html.match(/aria-label="Lane name"/g)).toHaveLength(2);
    expect(html).toContain('value="Clerk"');
    expect(html).toContain('value="Manager"');
    expect(html).toMatch(/<input[^>]*aria-label="Lane name"/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="Add lane to this pool"/);
    expect(html).toMatch(/class="element-inspector-action"/);
  });

  it('does not call create when selection changes from a task to a pool', () => {
    const onCreate = vi.fn();
    renderInspector(task, onCreate);
    renderInspector(pool, onCreate);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('does not show Add lane for a task', () => {
    expect(renderInspector(task)).not.toContain('Add lane to this pool');
  });

  it('shows Called element for a call activity', () => {
    const call: DiagramElement = {
      id: 'Call_1',
      type: 'bpmn:CallActivity',
      businessObject: { $type: 'bpmn:CallActivity', name: 'Pay', calledElement: 'PaymentProc' },
    };
    const html = renderInspector(call);
    expect(html).toMatch(/aria-label="Called element"/);
    expect(html).toContain('PaymentProc');
  });

  it('clicking the pool does not add a lane; Add lane twice lists two name fields', async () => {
    const gate = createInspectorCreateGate();
    const editor = await createSemanticEditor({ importXml: async () => undefined }, exportProcessXml(createProcess()));
    await editor.create('participant.pool');
    const host = editor.process().participants[0]!;
    const addLane = () => editor.create('participant.lane', host.id);

    if (gate.click(1)) await addLane();
    expect(editor.process().lanes).toHaveLength(0);
    expect(renderInspector(pool, noop, lanesInPool(editor.process().lanes, host.id))).toContain('No lanes yet');

    if (gate.pointerDown(0)) await addLane();
    if (gate.click(1)) await addLane();
    const afterFirst = lanesInPool(editor.process().lanes, host.id);
    expect(afterFirst).toHaveLength(1);
    expect(renderInspector(pool, noop, afterFirst).match(/aria-label="Lane name"/g)).toHaveLength(1);

    if (gate.pointerDown(0)) await addLane();
    if (gate.click(1)) await addLane();
    const [first, second] = editor.process().lanes;
    editor.rename(first!.id, 'Clerk');
    editor.rename(second!.id, 'Manager');
    const afterSecond = lanesInPool(editor.process().lanes, host.id);
    expect(afterSecond.map((lane) => lane.name)).toEqual(['Clerk', 'Manager']);
    const html = renderInspector(pool, noop, afterSecond);
    expect(html.match(/aria-label="Lane name"/g)).toHaveLength(2);
    expect(html).toContain('value="Clerk"');
    expect(html).toContain('value="Manager"');
    expect(html).toMatch(/class="element-inspector-action"/);
  });

  it('does not auto-create from selection effects', () => {
    const src = readFileSync(new URL('./ElementInspector.tsx', import.meta.url), 'utf8');
    const effects = [...src.matchAll(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g)].map((match) => match[0]);
    expect(effects.length).toBeGreaterThan(0);
    expect(effects.every((block) => !block.includes('onCreate'))).toBe(true);
    expect(src).toMatch(/addLaneGate\.current\.pointerDown/);
    expect(src).toMatch(/addLaneGate\.current\.click/);
    expect(src).toMatch(/onRename=\{onRenameLane\}/);
    expect(src).toMatch(/applyInspectorNameKey/);
    expect(src).toMatch(/commitInspectorName/);
    expect(src).toMatch(/onAssignLane\?\.\(laneId\)/);
    expect(src).toMatch(/aria-label="Lane"/);
  });
});

describe('ElementInspector lane assignment', () => {
  it('does not show a lane picker on a task when the process has no lanes', () => {
    expect(renderInspector(task)).not.toContain('aria-label="Lane"');
  });

  it('lists lanes on a task and keeps Add lane off the task inspector', () => {
    const html = renderInspector(task, noop, [], {
      nodeLanes: [
        { id: 'Lane_1', name: 'Clerk' },
        { id: 'Lane_2', name: 'Manager' },
      ],
      currentLaneId: 'Lane_1',
    });
    expect(html).toMatch(/<select[^>]*aria-label="Lane"/);
    expect(html).toContain('value="Lane_1"');
    expect(html).toContain('Clerk');
    expect(html).toContain('Manager');
    expect(html).not.toContain('Add lane to this pool');
    expect(html).not.toContain('assignee');
  });
});

describe('ElementInspector preserved BPMN fields', () => {
  it('includes PreservedBpmnFields for graph-backed documentation', async () => {
    const xml = readFileSync(
      new URL('../../../../../../packages/bpmn-adapter/fixtures/insurance-claim-stress.bpmn', import.meta.url),
      'utf8',
    );
    const process = await xmlToProcess(xml);
    const html = renderToStaticMarkup(
      createElement(ElementInspector, {
        element: { id: 'Task_Policy', type: 'bpmn:ServiceTask', businessObject: { $type: 'bpmn:ServiceTask', name: 'Fetch' } },
        canDelete: true,
        lint: emptyLint,
        replaceWorks: () => true,
        onRename: noop,
        onChangeTo: noop,
        onDelete: noop,
        onFlowKind: noop,
        onCondition: noop,
        onDefaultOutgoing: noop,
        onAttach: noop,
        onCreate: noop,
        process,
        onPreservedChange: noop,
      }),
    );
    expect(html).toContain('aria-label="Topic"');
    expect(html).toContain('claim-intake');
    expect(html).toContain('aria-label="Documentation"');
    expect(html).not.toContain('aria-label="Called element"');
  });

  it('hooks PreservedBpmnFields from ElementInspector', () => {
    const src = readFileSync(new URL('./ElementInspector.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/<PreservedBpmnFields /);
  });
});
