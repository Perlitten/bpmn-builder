import { describe, expect, it } from 'vitest';
import {
  addTask,
  addTextAnnotation,
  createFromComponent,
  createProcess,
  splitExclusive,
  type Process,
} from './index.js';

function named(p: Process, name: string): string {
  const node = p.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named ${name}`);
  return node.id;
}

describe('catalog flows (slice 2)', () => {
  it('setFlowKind marks the unique outgoing as conditional or default', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    const flow = p.flows.find((f) => f.source === named(p, 'Review'))!;
    p = createFromComponent(p, 'flow.conditional', { after: named(p, 'Review'), condition: '${ok}' }).process;
    expect(p.flows.find((f) => f.id === flow.id)).toMatchObject({ condition: '${ok}', isDefault: false });
    p = createFromComponent(p, 'flow.default', { after: flow.id }).process;
    const next = p.flows.find((f) => f.id === flow.id)!;
    expect(next.isDefault).toBe(true);
    expect(next.condition).toBeUndefined();
  });

  it('refuses a free Visio sequence flow and AND-gateway default', () => {
    const p = createProcess();
    expect(() => createFromComponent(p, 'flow.sequence')).toThrow(/no semantic create op/);
    expect(() => createFromComponent(p, 'flow.conditional')).toThrow(/Select a sequence flow/);
  });

  it('associates a text annotation to a selected task', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    expect(() => createFromComponent(p, 'flow.association', { after: named(p, 'Review') })).toThrow(/annotation/);
    p = addTextAnnotation(p, { text: 'SLA' }).process;
    const linked = createFromComponent(p, 'flow.association', { after: named(p, 'Review') });
    p = linked.process;
    const assoc = p.artifacts?.find((item) => String(item.$type).endsWith(':Association'));
    expect(assoc).toMatchObject({
      id: linked.id,
      sourceRef: { $ref: expect.any(String) },
      targetRef: { $ref: named(p, 'Review') },
    });
  });

  it('does not treat XOR branch flows as a single outgoing', () => {
    let p = createProcess();
    p = addTask(p, { name: 'A' }).process;
    p = splitExclusive(p, { after: named(p, 'A') }).process;
    expect(() => createFromComponent(p, 'flow.conditional', { after: p.regions[0]!.split })).toThrow(/several outgoing/);
  });
});
