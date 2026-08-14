import { describe, expect, it } from 'vitest';
import { exportProcessXml } from '@bpmn/bpmn-adapter';
import { bpmnComponentRegistry, createProcess, type Process } from '@bpmn/semantic-core';
import { pickCatalogItem } from './createFromCatalog';
import type { DiagramElement } from '../diagramElement';
import { createSemanticEditor } from '../semantic/session';

function poolElement(id: string, name: string): DiagramElement {
  return { id, type: 'bpmn:Participant', businessObject: { $type: 'bpmn:Participant', name } };
}

function peerOf(process: Process, participantName: string) {
  const participant = process.participants.find((item) => item.name === participantName);
  const graph = process.processes.find((item) => item.id === participant?.processId);
  if (!participant || !graph) throw new Error(`no filled pool ${participantName}`);
  return graph;
}

async function editorWithTwoPools() {
  const editor = await createSemanticEditor({ importXml: async () => undefined }, exportProcessXml(createProcess()));
  await editor.create('participant.pool', undefined);
  const supplier = editor.process().participants.find((item) => item.processId !== editor.process().id)!;
  return { editor, supplierId: supplier.id };
}

describe('create with a pool selected', () => {
  it('puts the task in the selected pool, not in the host pool', async () => {
    const { editor, supplierId } = await editorWithTwoPools();
    const hostNodes = editor.process().nodes.length;

    const result = await pickCatalogItem(
      bpmnComponentRegistry.get('activity.userTask')!,
      poolElement(supplierId, 'Supplier'),
      { create: async (catalogId, afterId) => !!(await editor.create(catalogId, afterId)) },
    );

    expect(result).toBeUndefined();
    const process = editor.process();
    expect(process.nodes).toHaveLength(hostNodes);
    const peer = process.processes.find((graph) => graph.id === process.participants.find((p) => p.id === supplierId)?.processId)!;
    expect(peer.nodes.filter((node) => node.type === 'task')).toHaveLength(1);
    expect(exportProcessXml(process)).toContain('bpmn:userTask');
  });

  it('renaming the pool renames its process, and two filled pools can exchange a message', async () => {
    const { editor, supplierId } = await editorWithTwoPools();
    await editor.create('activity.userTask', supplierId);
    editor.rename(supplierId, 'Supplier');

    expect(peerOf(editor.process(), 'Supplier').name).toBe('Supplier');

    await editor.create('flow.message', supplierId);
    const flows = editor.process().messageFlows;
    expect(flows).toHaveLength(1);
    expect(flows[0]!.source).toBe(supplierId);
    expect(exportProcessXml(editor.process())).toContain('bpmn:messageFlow');
  });
});
