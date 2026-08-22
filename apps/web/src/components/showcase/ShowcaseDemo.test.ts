// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowcaseDemo } from './ShowcaseDemo';

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}

describe('ShowcaseDemo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('cycles from typing to building and supports scenario/XML controls', () => {
    render(createElement(ShowcaseDemo));

    expect(screen.getByText('TYPING')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2_100));
    expect(screen.getByText('BUILDING')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'BRANCH ON AMOUNT' }));
    expect(screen.getByRole('button', { name: 'BRANCH ON AMOUNT' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Animated BPMN preview for: if over 5000, ask the CFO',
    );

    fireEvent.click(screen.getByRole('button', { name: 'SHOW XML' }));
    expect(screen.getByTestId('showcase-xml').textContent).toContain('bpmn:exclusiveGateway');
    fireEvent.click(screen.getByRole('button', { name: 'HIDE XML' }));
    expect(screen.getByTestId('showcase-preview')).toBeTruthy();
  });

  it('renders a stable static decision frame for reduced motion', () => {
    mockReducedMotion(true);
    render(createElement(ShowcaseDemo));

    expect(screen.getByText('STATIC FRAME')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'BRANCH ON AMOUNT' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('if over 5000');
  });
});
