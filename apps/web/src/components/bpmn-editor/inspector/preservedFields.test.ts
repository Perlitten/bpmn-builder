import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { xmlToProcess } from '@bpmn/bpmn-adapter';
import { applyPreservedValue, preservedFieldsFor } from './preservedFields';
import type { DiagramElement } from '../diagramElement';

const STRESS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../../../../packages/bpmn-adapter/fixtures/insurance-claim-stress.bpmn'),
  'utf8',
);

function el(id: string, type: string): DiagramElement {
  return { id, type, businessObject: { $type: type } };
}

describe('preservedFieldsFor', () => {
  it('exposes serializer-preserved values so they can be edited back', async () => {
    const process = await xmlToProcess(STRESS);
    const keys = (id: string, type: string) => preservedFieldsFor(process, el(id, type)).map((f) => f.key);

    expect(keys('Task_Policy', 'bpmn:ServiceTask')).toEqual(
      expect.arrayContaining(['documentation', 'topic', 'isExecutable', 'processDocumentation']),
    );
    expect(preservedFieldsFor(process, el('Task_Policy', 'bpmn:ServiceTask')).find((f) => f.key === 'topic')?.value).toBe(
      'claim-intake',
    );
    expect(preservedFieldsFor(process, el('Task_Policy', 'bpmn:ServiceTask')).find((f) => f.key === 'documentation')?.value).toBe(
      'Load the policy from the core system.',
    );

    expect(preservedFieldsFor(process, el('Task_Register', 'bpmn:UserTask')).find((f) => f.key === 'assignee')?.value).toBe(
      '${assignee}',
    );
    expect(preservedFieldsFor(process, el('Task_Fraud', 'bpmn:BusinessRuleTask')).find((f) => f.key === 'decisionRef')?.value).toBe(
      'risk-table',
    );
    expect(preservedFieldsFor(process, el('Task_Calc', 'bpmn:ScriptTask')).find((f) => f.key === 'script')?.value).toBe(
      "print('payout')",
    );
    expect(preservedFieldsFor(process, el('Catch_Timer', 'bpmn:IntermediateCatchEvent')).find((f) => f.key === 'timerDuration')?.value).toBe(
      'P5D',
    );
    expect(preservedFieldsFor(process, el('Task_MI', 'bpmn:Task')).find((f) => f.key === 'multiInstanceCardinality')?.value).toBe(
      '3',
    );
    expect(preservedFieldsFor(process, el('Task_MI', 'bpmn:Task')).find((f) => f.key === 'multiInstanceSequential')?.value).toBe(
      true,
    );
    expect(preservedFieldsFor(process, el('Start_Msg', 'bpmn:StartEvent')).find((f) => f.key === 'isExecutable')?.value).toBe(
      true,
    );
    expect(preservedFieldsFor(process, el('Start_Msg', 'bpmn:StartEvent')).find((f) => f.key === 'processDocumentation')?.value).toBe(
      'Claims handling process.',
    );
  });

  it('does not treat Camunda assignee as a product entity on a plain task', async () => {
    const process = await xmlToProcess(STRESS);
    const keys = preservedFieldsFor(process, el('Task_MI', 'bpmn:Task')).map((f) => f.key);
    expect(keys).not.toContain('assignee');
  });

  it('builds a commit payload from a draft value', async () => {
    const process = await xmlToProcess(STRESS);
    const topic = preservedFieldsFor(process, el('Task_Policy', 'bpmn:ServiceTask')).find((f) => f.key === 'topic')!;
    expect(applyPreservedValue(topic, 'new-topic')).toEqual({
      op: 'attr',
      id: 'Task_Policy',
      key: 'camunda:topic',
      value: 'new-topic',
    });
  });
});
