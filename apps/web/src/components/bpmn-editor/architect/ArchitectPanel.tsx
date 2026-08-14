import { useEffect, useRef, useState } from 'react';
import type { AgentScope, AgentScopeKind } from '@bpmn/agent-tools';
import type { ChatTurn } from '../../../lib/api';
import {
  ASSISTANT_TIMEOUT_MS,
  mapAssistantError,
  mergeTimeoutSignal,
  waitOrAbort,
} from '../../../lib/assistantRequest';
import {
  AGENT_SCOPE_OPTIONS,
  buildAssistantScope,
  scopeOptionEnabled,
  type AgentContext,
} from './agentScope';
import type { AssistantApplyResult } from './applyAssistant';
import { isArchitectComposeSubmitKey } from './architectComposeKey';
import { greetingReply, isGreetingMessage } from './greeting';
import { ArchitectShell } from './ArchitectShell';
import './architect.css';

type ArchitectPanelProps = {
  disabled?: boolean;
  configured?: boolean | null;
  context: AgentContext;
  onProtectBranch?: (locked: boolean) => void;
  onApply: (
    message: string,
    history: ChatTurn[],
    scope: AgentScope,
    signal: AbortSignal,
  ) => Promise<AssistantApplyResult>;
};

export function ArchitectPanel({
  disabled,
  configured,
  context,
  onProtectBranch,
  onApply,
}: ArchitectPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<{ dispose: () => void } | null>(null);
  const cancelledRef = useRef(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [diff, setDiff] = useState<string[]>([]);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [kind, setKind] = useState<AgentScopeKind>('process');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      timeoutRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!scopeOptionEnabled(kind, context)) setKind('process');
  }, [kind, context]);

  useEffect(() => {
    if (busy || error || !message) {
      if (busy || error) setSuccess(false);
      return;
    }
    setSuccess(true);
    const timer = window.setTimeout(() => setSuccess(false), 1400);
    return () => window.clearTimeout(timer);
  }, [busy, error, message]);

  const submit = (text = draft) => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    if (isGreetingMessage(value)) {
      abortRef.current?.abort();
      timeoutRef.current?.dispose();
      timeoutRef.current = null;
      abortRef.current = null;
      cancelledRef.current = false;
      const reply = greetingReply(value);
      setError(null);
      setFailedText(null);
      setHistory((prev) =>
        [...prev, { role: 'user' as const, text: value }, { role: 'assistant' as const, text: reply }].slice(-12),
      );
      setMessage(reply);
      setDiff([]);
      setDraft('');
      return;
    }
    if (configured === false) return;
    abortRef.current?.abort();
    timeoutRef.current?.dispose();
    const ac = new AbortController();
    abortRef.current = ac;
    const timed = mergeTimeoutSignal(ac.signal, ASSISTANT_TIMEOUT_MS);
    timeoutRef.current = timed;
    cancelledRef.current = false;
    setBusy(true);
    setError(null);
    setFailedText(null);
    setSuccess(false);
    void waitOrAbort(onApply(value, history, buildAssistantScope(kind, context), timed.signal), timed.signal)
      .then((result) => {
        if (timed.signal.aborted || cancelledRef.current) return;
        setHistory((prev) =>
          [...prev, { role: 'user' as const, text: value }, { role: 'assistant' as const, text: result.message }].slice(
            -12,
          ),
        );
        setMessage(result.message);
        setDiff(result.diff);
        setDraft('');
        setFailedText(null);
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        setDraft(value);
        setFailedText(value);
        setError(mapAssistantError(err, false).message);
      })
      .finally(() => {
        timed.dispose();
        if (timeoutRef.current === timed) timeoutRef.current = null;
        if (abortRef.current === ac) abortRef.current = null;
        setBusy(false);
      });
  };

  const cancelBusy = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    timeoutRef.current?.dispose();
    timeoutRef.current = null;
    setBusy(false);
  };

  const dismissError = () => {
    setError(null);
    setFailedText(null);
  };

  const editFailed = () => {
    setError(null);
    textareaRef.current?.focus();
  };

  return (
    <ArchitectShell surface="editor" busy={busy} error={Boolean(error)} success={success}>
      <fieldset className="architect-scope">
        <legend>Scope</legend>
        <div className="architect-scope-options" role="radiogroup" aria-label="Agent scope">
          {AGENT_SCOPE_OPTIONS.map((option) => {
            const enabled = scopeOptionEnabled(option.kind, context);
            return (
              <label
                key={option.kind}
                className={kind === option.kind ? 'is-active' : enabled ? undefined : 'is-disabled'}
              >
                <input
                  type="radio"
                  name="agent-scope"
                  className="sr-only"
                  checked={kind === option.kind}
                  disabled={!enabled || busy || disabled}
                  onChange={() => setKind(option.kind)}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      {context.branchId ? (
        <label className="architect-protect">
          <input
            type="checkbox"
            checked={context.branchLocked}
            disabled={busy || disabled || !onProtectBranch}
            onChange={(event) => onProtectBranch?.(event.target.checked)}
          />
          Protect this branch from AI
        </label>
      ) : null}
      <label>
        <span className="sr-only">Describe a semantic edit</span>
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={busy || disabled}
          rows={3}
          placeholder="Split after Review into approved and rejected"
          aria-label="Describe a semantic edit of this process"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (!isArchitectComposeSubmitKey(event)) return;
            event.preventDefault();
            submit();
          }}
        />
      </label>
      <div className="architect-actions">
        {busy ? (
          <>
            <button type="button" className="architect-apply" disabled>
              Applying…
            </button>
            <button type="button" className="architect-secondary" onClick={cancelBusy}>
              Cancel
            </button>
          </>
        ) : error ? (
          <>
            <button type="button" className="architect-apply" onClick={() => submit(failedText ?? draft)}>
              Retry
            </button>
            <button type="button" className="architect-secondary" onClick={editFailed}>
              Edit
            </button>
            <button type="button" className="architect-secondary" onClick={dismissError}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="architect-apply"
            disabled={disabled || !draft.trim() || (configured === false && !isGreetingMessage(draft))}
            onClick={() => submit()}
          >
            Apply
          </button>
        )}
      </div>
      {configured === false ? (
        <p className="architect-hint">AI is not configured. Add a provider key and restart.</p>
      ) : null}
      {busy ? (
        <p className="architect-hint" role="status">
          Applying semantic edits…
        </p>
      ) : null}
      {error ? (
        <p className="architect-error" role="alert">
          {error}
        </p>
      ) : null}
      {diff.length > 0 ? (
        <ul className="architect-diff">
          {diff.map((line, index) => (
            <li key={`${index}:${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="architect-message">{message}</p> : null}
    </ArchitectShell>
  );
}
