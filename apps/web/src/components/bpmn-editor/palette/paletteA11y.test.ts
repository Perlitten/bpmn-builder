import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CatalogFlyout } from './CatalogFlyout';
import { ContinueWith } from './ContinueWith';
import { PaletteRail } from './PaletteRail';

const dir = dirname(fileURLToPath(import.meta.url));
const noop = () => undefined;

function hasNestedButtons(html: string): boolean {
  let depth = 0;
  const token = /<\/?button\b/gi;
  for (const match of html.matchAll(token)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth > 1) return true;
  }
  return false;
}

describe('palette keyboard a11y', () => {
  it('renders rail tools and categories as buttons', () => {
    const html = renderToStaticMarkup(
      createElement(PaletteRail, {
        tool: 'select',
        catalogView: null,
        query: '',
        selection: null,
        hasParticipant: false,
        onTool: noop,
        onOpenCatalog: noop,
        onQueryChange: noop,
        onPick: noop,
        onCloseCatalog: noop,
      }),
    );
    expect(html).toMatch(/<button[^>]*aria-label="Select"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"/);
    expect(html).toMatch(/class="palette-rail-btn is-tool-active"/);
    expect(html).toMatch(/<button[^>]*aria-label="Add element"/);
    expect(html).toMatch(/<button[^>]*aria-label="Add Task"/);
    expect(html).not.toMatch(/<div[^>]*class="palette-rail-btn"/);
    expect(hasNestedButtons(html)).toBe(false);
  });

  it('raises the open catalog above canvas controls', () => {
    const html = renderToStaticMarkup(
      createElement(PaletteRail, {
        tool: 'select',
        catalogView: 'home',
        query: '',
        selection: null,
        hasParticipant: false,
        onTool: noop,
        onOpenCatalog: noop,
        onQueryChange: noop,
        onPick: noop,
        onCloseCatalog: noop,
      }),
    );
    const css = readFileSync(join(dir, 'palette.css'), 'utf8');
    expect(html).toMatch(/palette-rail is-catalog-open/);
    expect(css).toMatch(/\.palette-rail\.is-catalog-open\s*\{[\s\S]*?z-index:\s*14/);
  });

  it('gives the selected tool an unmistakable visual state', () => {
    const css = readFileSync(join(dir, 'palette.css'), 'utf8');
    expect(css).toMatch(/\.palette-rail-btn\.is-tool-active[\s\S]*?background:\s*var\(--color-ink\)/);
    expect(css).toMatch(/\.palette-rail-btn\.is-tool-active[\s\S]*?color:\s*var\(--color-canvas\)/);
  });

  it('treats Suggested rows as pick-to-create, not submenu chevrons', () => {
    const html = renderToStaticMarkup(
      createElement(CatalogFlyout, {
        view: 'home',
        query: '',
        selection: null,
        hasParticipant: false,
        onQueryChange: noop,
        onViewChange: noop,
        onPick: noop,
        onClose: noop,
      }),
    );
    expect(html).toContain('palette-suggested');
    expect(html).toMatch(/<button[^>]*class="palette-suggested-item is-highlighted"/);
    expect(html).toContain('Add Task');
    expect(html).not.toMatch(/lucide-chevron-right/);
    expect(html).not.toContain('ChevronRight');
    expect(hasNestedButtons(html)).toBe(false);
  });

  it('renders catalog rows as buttons so keyboard can create', () => {
    const html = renderToStaticMarkup(
      createElement(CatalogFlyout, {
        view: 'activities',
        query: '',
        selection: { id: 'Start_1', type: 'bpmn:StartEvent' },
        hasParticipant: false,
        onQueryChange: noop,
        onViewChange: noop,
        onPick: noop,
        onClose: noop,
      }),
    );
    expect(html).toMatch(/<button[^>]*class="palette-item"/);
    expect(html).toContain('Task');
    expect(html).not.toMatch(/<div[^>]*class="palette-item"/);
    expect(html).not.toMatch(/lucide-chevron-right/);
    expect(hasNestedButtons(html)).toBe(false);
  });

  it('renders Continue+ as a button', () => {
    const html = renderToStaticMarkup(
      createElement(ContinueWith, {
        source: { id: 'Task_1', type: 'bpmn:Task' },
        hasParticipant: false,
        anchor: { left: 10, top: 20 },
        onPick: noop,
      }),
    );
    expect(html).toMatch(/<button[^>]*aria-label="Continue with"/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toMatch(/<div[^>]*class="continue-plus"/);
    expect(hasNestedButtons(html)).toBe(false);
  });

  it('reuses hover focus-visible styles on catalog and Continue+', () => {
    const css = readFileSync(join(dir, 'palette.css'), 'utf8');
    expect(css).toMatch(/\.palette-item:focus-visible/);
    expect(css).toMatch(/\.continue-plus:focus-visible/);
    expect(css).toMatch(/\.continue-menu button:focus-visible/);
  });

  it('exposes the catalog as a modal dialog so Tab stays inside', () => {
    const html = renderToStaticMarkup(
      createElement(CatalogFlyout, {
        view: 'activities',
        query: '',
        selection: { id: 'Start_1', type: 'bpmn:StartEvent' },
        hasParticipant: false,
        onQueryChange: noop,
        onViewChange: noop,
        onPick: noop,
        onClose: noop,
      }),
    );
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
  });
});
