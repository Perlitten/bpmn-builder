// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Process, ProcessPatch } from '@bpmn/domain';
import { ProcessEditorPage } from './ProcessEditorPage';

const mocks = vi.hoisted(() => ({
  editorProps: null as null | { xml: string; onChange: (xml: string) => void },
  fetchProcess: vi.fn(),
  saveProcess: vi.fn(),
  saveAsTemplate: vi.fn(),
}));

vi.mock('../components/auth/AuthGate', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'ada@example.com', name: 'Ada', avatarUrl: null },
    signOut: vi.fn(),
  }),
}));

vi.mock('../components/bpmn-editor/BpmnEditor', async () => {
  const React = await import('react');
  return {
    BpmnEditor: React.forwardRef(function MockBpmnEditor(
      props: { xml: string; onChange: (xml: string) => void },
      _ref,
    ) {
      mocks.editorProps = props;
      return React.createElement('div', { 'data-testid': 'bpmn-editor' });
    }),
  };
});

vi.mock('../components/shell/EditorChrome', async () => {
  const React = await import('react');
  return { EditorChrome: () => React.createElement('div', { 'data-testid': 'editor-chrome' }) };
});

vi.mock('../components/shell/UserMenu', () => ({ UserMenu: () => null }));

vi.mock('../lib/api', () => ({
  fetchProcess: mocks.fetchProcess,
  saveProcess: mocks.saveProcess,
  saveAsTemplate: mocks.saveAsTemplate,
}));

const serverXml = '<bpmn:startEvent id="server" />';
const localXml = '<bpmn:startEvent id="local" />';

function processFixture(patch: Partial<Process> = {}): Process {
  return {
    id: 'process-1',
    name: 'Approval',
    description: null,
    status: 'draft',
    bpmnXml: serverXml,
    workflowJson: null,
    version: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:04.000Z',
    ...patch,
  };
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
  mocks.editorProps = null;
  vi.clearAllMocks();
});

describe('ProcessEditorPage persistence orchestration', () => {
  it('journals live XML, guards leaving, and saves it with the current version', async () => {
    const initial = processFixture();
    mocks.fetchProcess.mockResolvedValue({ process: initial });
    mocks.saveProcess.mockImplementation(async (_id: string, patch: ProcessPatch) => ({
      process: processFixture({
        ...patch,
        version: initial.version + 1,
        updatedAt: '2026-01-01T00:00:05.000Z',
      }),
    }));

    const view = render(
      createElement(ProcessEditorPage, {
        processId: initial.id,
        onBack: vi.fn(),
      }),
    );
    await waitFor(() => expect(mocks.editorProps?.xml).toBe(serverXml));

    vi.useFakeTimers();
    act(() => mocks.editorProps?.onChange(localXml));
    expect(mocks.editorProps?.xml).toBe(localXml);

    const dirtyLeave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyLeave);
    expect(dirtyLeave.defaultPrevented).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(mocks.saveProcess).toHaveBeenCalledWith(initial.id, {
      bpmnXml: localXml,
      version: initial.version,
    });

    const cleanLeave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanLeave);
    expect(cleanLeave.defaultPrevented).toBe(false);

    view.unmount();
  });
});
