import { createProcess, getNode } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { semanticDiff } from './diff.js';
import { executePlan } from './tools.js';

describe('semanticDiff', () => {
  it('reports added XOR and branches, not XML', () => {
    const origin = createProcess();
    const withTask = executePlan(origin, [{ name: 'addTask', args: { name: 'Review' } }]);
    const split = executePlan(withTask.process, [
      {
        name: 'splitExclusive',
        args: { after: 'Review', name: 'Approved?', branches: [{ name: 'Yes' }, { name: 'No' }] },
      },
    ]);
    const lines = semanticDiff(withTask.process, split.process);
    expect(lines).toEqual(['Added XOR Approved?', 'Added branch Yes', 'Added branch No']);
    expect(lines.join('\n')).not.toMatch(/bpmn:|<definitions|dc:Bounds/i);
  });

  it('reports added tasks and renames', () => {
    const origin = createProcess();
    const added = executePlan(origin, [{ name: 'addAfter', args: { after: 'StartEvent_1', name: 'Screen' } }]);
    expect(semanticDiff(origin, added.process)).toEqual(['Added task Screen']);
    const renamed = executePlan(added.process, [
      { name: 'renameElement', args: { id: added.id, name: 'Screen application' } },
    ]);
    expect(semanticDiff(added.process, renamed.process)).toEqual(['Renamed Screen → Screen application']);
    expect(getNode(renamed.process, added.id).name).toBe('Screen application');
  });
});
