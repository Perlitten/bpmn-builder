import { describe, it, expect } from 'vitest';
import { createModdle, restoreExtensions, snapshotExtensions, serializeDefinitions } from './moddle.js';

describe('moddle unsafe keys', () => {
  it('allows constructor and prototype as extension attributes', async () => {
    const moddle = createModdle();
    const prop1 = moddle.create('bpmn:Property', { name: 'constructor' });
    const prop2 = moddle.create('bpmn:Property', { name: 'prototype' });

    const elements = moddle.create('bpmn:ExtensionElements', {
      values: [prop1, prop2]
    });

    // We mock a task that has this extension element
    const task = moddle.create('bpmn:Task', { id: 'Task_1', extensionElements: elements });

    const snapshot = snapshotExtensions(task);
    const restored = restoreExtensions(moddle, snapshot!);

    const process = moddle.create('bpmn:Process', { id: 'P_1', extensionElements: restored });
    const def = moddle.create('bpmn:Definitions', { rootElements: [process] });

    const xml = serializeDefinitions(def);
    expect(xml).toContain('name="constructor"');
    expect(xml).toContain('name="prototype"');
  });
});
