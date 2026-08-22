import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, minimumBusyDelay } from './Button';
import { ChromeMenuItem, nextMenuIndex } from './ChromeMenu';
import { ConfirmDialog } from './ConfirmDialog';

describe('shared chrome focus and dialogs', () => {
  it('routes Button styling through the shared component contract', () => {
    const html = renderToStaticMarkup(createElement(Button, { children: 'New' }));
    expect(html).toContain('class="ui-button');
    expect(html).toContain('data-variant="primary"');
  });

  it('announces loading writes without changing the control contract', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { loading: true, loadingLabel: 'Saving…', children: 'Save' }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
    expect(html).toContain('Saving…');
    expect(html).toMatch(/ui-button-content" aria-hidden="true">Save/);
  });

  it('keeps a loading state visible for at least 400ms', () => {
    expect(minimumBusyDelay(1_000, 1_100)).toBe(300);
    expect(minimumBusyDelay(1_000, 1_500)).toBe(0);
  });

  it('marks confirm dialogs as modal with a labelled dialog', () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        open: true,
        title: 'Could not import BPMN',
        body: 'The file could not be read.',
        confirmLabel: 'Retry',
        role: 'alertdialog',
        onConfirm: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(html).toMatch(/role="alertdialog"/);
    expect(html).toMatch(/aria-modal="true"/);
    expect(html).toContain('Could not import BPMN');
    expect(html).toContain('Cancel');
    expect(html).toContain('Retry');
  });

  it('aligns an optional icon with the menu item label', () => {
    const html = renderToStaticMarkup(
      createElement(ChromeMenuItem, {
        onSelect: () => undefined,
        icon: createElement('svg', { viewBox: '0 0 24 24' }),
        children: 'Download BPMN',
      }),
    );
    expect(html).toContain('Download BPMN');
    expect(html).toContain('<svg');
    expect(html).toContain('ui-menu-item');
    expect(html).toMatch(/aria-hidden/);
  });

  it('wraps menu focus with arrow keys and supports Home / End', () => {
    expect(nextMenuIndex(3, 0, 'ArrowDown')).toBe(1);
    expect(nextMenuIndex(3, 2, 'ArrowDown')).toBe(0);
    expect(nextMenuIndex(3, 0, 'ArrowUp')).toBe(2);
    expect(nextMenuIndex(3, 1, 'Home')).toBe(0);
    expect(nextMenuIndex(3, 1, 'End')).toBe(2);
    expect(nextMenuIndex(3, 1, 'Enter')).toBeNull();
  });

  it('lets Tab leave menus instead of applying a modal focus trap', () => {
    const source = readFileSync(new URL('./ChromeMenu.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/useModal/);
    expect(source).toMatch(/event\.key === 'Tab'/);
    expect(source).toMatch(/event\.key !== 'Escape'/);
  });
});
