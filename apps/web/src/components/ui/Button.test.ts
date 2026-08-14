import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { ChromeMenuItem, nextMenuIndex } from './ChromeMenu';
import { ConfirmDialog } from './ConfirmDialog';

describe('shared chrome focus and dialogs', () => {
  it('gives Button the same focus-visible ring as palette controls', () => {
    const html = renderToStaticMarkup(createElement(Button, { children: 'New' }));
    expect(html).toMatch(/focus-visible:outline/);
    expect(html).toMatch(/focus-visible:outline-ink/);
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
    expect(html).toMatch(/items-start gap-2/);
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
});
