import { describe, expect, it, vi } from 'vitest';
import { applyInspectorNameKey, commitInspectorName, inspectorNameKeyAction } from './inspectorNameKey';

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

describe('inspector name key', () => {
  it('commits on Tab without preventDefault so focus can move to the next field', () => {
    const event = keyEvent('Tab');
    expect(applyInspectorNameKey(event)).toBe('commit');
    expect(inspectorNameKeyAction('Tab')).toBe('commit');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('commits on Enter and preventDefault so the canvas does not steal the key', () => {
    const event = keyEvent('Enter');
    expect(applyInspectorNameKey(event)).toBe('commit');
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('reverts on Escape without committing', () => {
    const event = keyEvent('Escape');
    expect(applyInspectorNameKey(event)).toBe('revert');
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('ignores typing keys', () => {
    const event = keyEvent('a');
    expect(applyInspectorNameKey(event)).toBeNull();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('does not re-commit an unchanged draft (Tab after Enter must not discard)', () => {
    const commit = vi.fn();
    expect(commitInspectorName('Bank', 'Bank', commit)).toBe('Bank');
    expect(commit).not.toHaveBeenCalled();
    expect(commitInspectorName('Treasury', 'Bank', commit)).toBe('Treasury');
    expect(commit).toHaveBeenCalledWith('Treasury');
  });
});
