import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const uiDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(uiDir, '../..');

describe('product design-system contract', () => {
  it('defines the semantic tokens consumed by product components', () => {
    const css = readFileSync(join(srcDir, 'styles/tokens.css'), 'utf8');
    for (const token of [
      '--color-border-interactive',
      '--color-border-disabled',
      '--color-ink-disabled',
      '--space-1',
      '--space-9',
      '--radius-0',
      '--radius-2',
      '--fs-10',
      '--fs-14',
      '--dur-instant',
      '--dur-overlay',
      '--z-inspector',
      '--z-menu',
      '--z-rail-open',
      '--control-hit',
      '--control-visual',
    ]) {
      expect(css, `missing ${token}`).toContain(token);
    }
  });

  it('keeps raw product colors in the token source only', () => {
    const productStyles = [
      join(uiDir, 'ui.css'),
      join(srcDir, 'components/bpmn-editor/palette/palette.css'),
      join(srcDir, 'components/bpmn-editor/inspector/inspector.css'),
      join(srcDir, 'components/bpmn-editor/zoomControls.css'),
    ];

    for (const file of productStyles) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it('keeps product geometry square or at the two-pixel exception', () => {
    const css = readFileSync(join(uiDir, 'ui.css'), 'utf8');
    expect(css).not.toMatch(/border-radius:\s*(?:[3-9]|[1-9]\d)px/);
  });
});
