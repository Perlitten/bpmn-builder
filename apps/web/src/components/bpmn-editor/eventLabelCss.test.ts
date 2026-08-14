import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('event label paint', () => {
  it('keeps external labels at 12px without clipping', () => {
    const css = readFileSync(join(dir, '../../index.css'), 'utf8');
    expect(css).toMatch(/\.djs-label \{[^}]*overflow: visible/s);
    expect(css).toMatch(/\.djs-label \{[^}]*font-size: 12px/s);
    expect(css).not.toMatch(/\.djs-lasso-overlay \{[^}]*display:\s*none/s);
    expect(css).toMatch(/\.djs-space-tool \{[^}]*display:\s*none/s);
    const editor = readFileSync(join(dir, 'BpmnEditor.tsx'), 'utf8');
    expect(editor).toMatch(/externalStyle:\s*\{\s*fontSize:\s*12/);
  });
});
