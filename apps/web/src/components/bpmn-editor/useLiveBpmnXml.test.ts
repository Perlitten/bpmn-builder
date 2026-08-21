// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLiveBpmnXml } from './useLiveBpmnXml';

describe('useLiveBpmnXml', () => {
  it('keeps editor XML authoritative until a new document identity is loaded', () => {
    const serverXml = '<bpmn:startEvent id="server" />';
    const localXml = '<bpmn:startEvent id="local" />';
    const nextServerXml = '<bpmn:startEvent id="next-server" />';
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ identity, initialXml }) => useLiveBpmnXml(identity, initialXml, onChange),
      { initialProps: { identity: 'process-1', initialXml: serverXml } },
    );

    expect(result.current.currentXml).toBe(serverXml);
    const initialRevision = result.current.revision;

    act(() => result.current.emit(localXml));
    expect(result.current.currentXml).toBe(localXml);
    expect(result.current.xmlRef.current).toBe(localXml);
    expect(result.current.revision).toBeGreaterThan(initialRevision);
    expect(onChange).toHaveBeenCalledWith(localXml);

    rerender({ identity: 'process-1', initialXml: localXml });
    expect(result.current.currentXml).toBe(localXml);

    rerender({ identity: 'process-2', initialXml: nextServerXml });
    expect(result.current.currentXml).toBe(nextServerXml);
    expect(result.current.xmlRef.current).toBe(nextServerXml);
  });
});
