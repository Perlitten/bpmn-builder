import { describe, expect, it } from 'vitest';
import {
  addTask,
  createFromComponent,
  createProcess,
  type Process,
} from './index.js';

function named(p: Process, name: string): string {
  const node = p.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named ${name}`);
  return node.id;
}

describe('catalog data and artifacts (slice 4)', () => {
  it('creates a data object, data store, annotation, and group on the extras list', () => {
    let p = createProcess();
    p = addTask(p, { name: 'Review' }).process;
    const data = createFromComponent(p, 'data.object', { name: 'Claim file' });
    p = data.process;
    expect(p.artifacts?.some((item) => item.id === data.id && String(item.$type).includes('DataObject'))).toBe(true);

    const store = createFromComponent(p, 'data.store', { name: 'Claims DB' });
    p = store.process;
    expect(p.artifacts?.some((item) => item.id === store.id && String(item.$type).includes('DataStore'))).toBe(true);

    const note = createFromComponent(p, 'artifact.textAnnotation', { after: named(p, 'Review'), name: 'SLA' });
    p = note.process;
    expect(p.artifacts?.some((item) => item.id === note.id && String(item.$type).endsWith('TextAnnotation'))).toBe(true);
    expect(p.artifacts?.some((item) => String(item.$type).endsWith('Association'))).toBe(true);

    const group = createFromComponent(p, 'artifact.group', { name: 'Review pack' });
    expect(group.process.artifacts?.some((item) => item.id === group.id && String(item.$type).endsWith('Group'))).toBe(
      true,
    );
  });
});
