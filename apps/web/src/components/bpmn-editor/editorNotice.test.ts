import { describe, expect, it } from 'vitest';
import { editorNoticeText, visibleEditorChrome } from './editorNotice';

describe('visibleEditorChrome', () => {
  it('shows a split-insert notice even while first-run onboarding is still up', () => {
    const notice = editorNoticeText(new Error('ambiguous after ExclusiveGateway_1: pass branchId'));
    expect(visibleEditorChrome(true, notice)).toBe('hint');
    expect(visibleEditorChrome(true, null)).toBe('onboarding');
    expect(visibleEditorChrome(false, notice)).toBe('hint');
  });
});
