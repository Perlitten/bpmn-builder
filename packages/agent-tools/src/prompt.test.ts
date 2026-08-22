import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import {
  collaborationRequested,
  constrainToolPlan,
  creatableConstructions,
  toolSystemPrompt,
  userFacingAssistantMessage,
} from './prompt.js';

describe('architect catalog prompt', () => {
  it('exposes only creatable constructions, not the searchable catalog', () => {
    const ids = creatableConstructions().map((row) => row.id);
    const catalog = bpmnComponentRegistry.list().map((row) => row.id);
    expect(catalog.length).toBeGreaterThan(50);
    expect(ids.length).toBeLessThan(catalog.length);
    expect(ids).toContain('activity.userTask');
    expect(ids).toContain('gateway.exclusive');
    expect(ids).toContain('gateway.complex');
    expect(ids).toContain('data.object');
    expect(ids).toContain('start.message');
    expect(ids).toContain('boundary.error');
    expect(ids).toContain('activity.transaction');
    expect(ids).toContain('participant.pool');
    expect(ids).not.toContain('start.none');
    expect(ids).not.toContain('end.none');
    expect(ids).toContain('flow.sequence');
    expect(ids).toContain('boundary.compensation');
    expect(ids.every((id) => bpmnComponentRegistry.get(id)?.implemented)).toBe(true);
  });

  it('does not prime the model to dump catalog coverage to the user', () => {
    const prompt = toolSystemPrompt();
    expect(prompt).not.toContain('72');
    expect(prompt).not.toContain('Not in modeling profile yet');
    expect(prompt).not.toContain('canCreate');
    expect(prompt).toContain('gateway.complex');
    expect(prompt).toContain('data.object');
    expect(prompt).toContain('createComponent');
    expect(prompt).toContain('attachBoundaryError');
    expect(prompt).toContain('splitComplex');
    expect(prompt).toContain('setFlowKind');
    expect(prompt).not.toContain('Registry componentId values');
    expect(prompt).toContain('activity.userTask');
    expect(prompt).toMatch(/Never narrate catalog coverage/);
    expect(prompt).toMatch(/first sentence of message must describe the process edit/);
    expect(prompt).toMatch(/semanticMeaning for search and intent matching/);
    expect(prompt).toMatch(/not create permissions/);
    expect(prompt).toMatch(/Do not start with a pool/);
    expect(prompt).toMatch(/inspect\* is the process graph, not the component catalog/);
    expect(prompt).toMatch(/assignLane \{ nodeId, laneId \}/);
    expect(prompt).toMatch(/not for boundary events/);
    expect(prompt).toMatch(/splitParallel, a non-empty named branch is materialised as one task/);
    expect(prompt).toMatch(/addTask with branchId only for extra activities/);
    expect(prompt).toMatch(/first addLane creates the host participant automatically/);
    expect(prompt).toMatch(/never pass a Lane_\* id as participantId/);
  });

  it('drops unsolicited pool tools on a registration flow', () => {
    expect(collaborationRequested('registration flow')).toBe(false);
    expect(
      constrainToolPlan('registration flow', [
        { name: 'addPool', args: { name: 'Partner' } },
        { name: 'addTask', args: { name: 'Register' } },
      ]),
    ).toEqual([{ name: 'addTask', args: { name: 'Register' } }]);
    expect(
      constrainToolPlan('add a pool for the bank', [{ name: 'addPool', args: { name: 'Bank' } }]),
    ).toEqual([{ name: 'addPool', args: { name: 'Bank' } }]);
    expect(
      constrainToolPlan('registration flow', [{ name: 'assignLane', args: { nodeId: 'Task_1', laneId: 'Lane_2' } }]),
    ).toEqual([{ name: 'assignLane', args: { nodeId: 'Task_1', laneId: 'Lane_2' } }]);
    expect(
      constrainToolPlan('registration flow', [
        { name: 'createComponent', args: { componentId: 'participant.pool' } },
        { name: 'createComponent', args: { componentId: 'data.object' } },
      ]),
    ).toEqual([{ name: 'createComponent', args: { componentId: 'data.object' } }]);
  });

  it('strips catalog census from the user-visible reply', () => {
    expect(
      userFacingAssistantMessage(
        'Каталог собран: реально доступно ~22 компонента из ~72 — остальные помечены Not in modeling profile yet. Строю из того, что есть. Начинаю с пула.',
      ),
    ).toBe('Updated the process from your request.');
    expect(userFacingAssistantMessage('Added Register after Start.')).toBe('Added Register after Start.');
    expect(userFacingAssistantMessage('Starting with a pool for the bank.', { collaboration: true })).toBe(
      'Starting with a pool for the bank.',
    );
  });
});
