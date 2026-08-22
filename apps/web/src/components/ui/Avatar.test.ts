// @vitest-environment jsdom
import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders the signed-in user image when one is available', () => {
    const { container } = render(createElement(Avatar, {
      name: 'Ada Lovelace',
      src: 'https://lh3.googleusercontent.com/ada',
    }));

    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://lh3.googleusercontent.com/ada');
  });

  it('falls back to initials when the image cannot load', () => {
    const { container } = render(createElement(Avatar, {
      name: 'Ada Lovelace',
      src: 'https://lh3.googleusercontent.com/missing',
    }));
    fireEvent.error(container.querySelector('img')!);

    expect(screen.getByText('AL')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });
});
