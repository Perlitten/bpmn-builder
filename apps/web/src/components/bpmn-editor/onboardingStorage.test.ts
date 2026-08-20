import { describe, expect, it } from 'vitest';
import {
  EDITOR_ONBOARDING_COPY,
  EDITOR_ONBOARDING_KEY,
  readEditorOnboardingSeen,
  writeEditorOnboardingSeen,
} from './onboardingStorage';

describe('editor onboarding', () => {
  it('is dismissible and does not nag after dismiss', () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    };
    expect(readEditorOnboardingSeen(storage)).toBe(false);
    writeEditorOnboardingSeen(storage);
    expect(store[EDITOR_ONBOARDING_KEY]).toBe('1');
    expect(readEditorOnboardingSeen(storage)).toBe(true);
    expect(EDITOR_ONBOARDING_COPY).toMatch(/Double-click a shape to rename it/);
    expect(EDITOR_ONBOARDING_COPY).toMatch(/Select a shape to append steps/);
    expect(EDITOR_ONBOARDING_COPY).toMatch(/choose Pan or hold Space while dragging the canvas/);
    expect(EDITOR_ONBOARDING_COPY).not.toMatch(/board|process vibes|flow buddy|Continue\+|Fit accounts/i);
  });
});
