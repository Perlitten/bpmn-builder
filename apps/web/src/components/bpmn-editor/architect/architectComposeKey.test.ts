import { describe, expect, it } from 'vitest';
import { isArchitectComposeSubmitKey } from './architectComposeKey';

const enter = {
  key: 'Enter',
  shiftKey: false,
} as const;

describe('isArchitectComposeSubmitKey', () => {
  it('treats Enter as submit', () => {
    expect(isArchitectComposeSubmitKey(enter)).toBe(true);
  });

  it('keeps Shift+Enter as a newline', () => {
    expect(isArchitectComposeSubmitKey({ ...enter, shiftKey: true })).toBe(false);
  });

  it('ignores Enter while IME is composing', () => {
    expect(isArchitectComposeSubmitKey({ ...enter, isComposing: true })).toBe(false);
    expect(isArchitectComposeSubmitKey({ ...enter, nativeEvent: { isComposing: true } })).toBe(false);
    expect(isArchitectComposeSubmitKey({ ...enter, keyCode: 229 })).toBe(false);
    expect(isArchitectComposeSubmitKey({ ...enter, nativeEvent: { keyCode: 229 } })).toBe(false);
  });

  it('does not treat other keys as submit', () => {
    expect(isArchitectComposeSubmitKey({ key: 'a', shiftKey: false })).toBe(false);
    expect(isArchitectComposeSubmitKey({ key: 'Escape', shiftKey: false })).toBe(false);
  });
});
