// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModal } from './useModal';

function ModalHarness({ open }: { open: boolean }) {
  const { ref } = useModal({ open, onClose: vi.fn() });
  return createElement(
    'main',
    { 'data-testid': 'main', style: { overflow: 'auto' } },
    createElement('button', { 'data-testid': 'outside' }, 'Outside'),
    createElement(
      'div',
      { ref, role: 'dialog', tabIndex: -1, 'data-testid': 'dialog' },
      createElement('button', { 'data-modal-initial-focus': true }, 'Inside'),
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  vi.unstubAllGlobals();
});

describe('useModal DOM isolation', () => {
  it('makes outside content inert, locks scrolling, and restores both on close', () => {
    const view = render(createElement(ModalHarness, { open: true }));
    const outside = screen.getByTestId('outside');
    const main = screen.getByTestId('main');

    expect(outside.hasAttribute('inert')).toBe(true);
    expect(main.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    view.rerender(createElement(ModalHarness, { open: false }));
    expect(outside.hasAttribute('inert')).toBe(false);
    expect(main.style.overflow).toBe('auto');
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });
});
