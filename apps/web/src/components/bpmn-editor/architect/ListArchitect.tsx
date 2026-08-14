import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { descriptionInputIssue } from '../../../lib/describeProcess';
import { MAX_DESCRIPTION_CHARS } from '../../../lib/linearProcess';
import { useModal } from '../../ui/useModal';
import { ArchitectMascot } from './ArchitectMascot';
import {
  listArchitectPanelBox,
  listArchitectPanelStyle,
  type ListArchitectPanelBox,
} from './listArchitectPanel';
import { resolveMascotMood } from './mascotMood';
import './architect.css';

type ListArchitectProps = {
  busy: boolean;
  error: string | null;
  onDescribe: (text: string, signal: AbortSignal) => void;
};

export function ListArchitect({ busy, error, onDescribe }: ListArchitectProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [draft, setDraft] = useState('');
  const [box, setBox] = useState<ListArchitectPanelBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { ref: panelRef } = useModal({
    open,
    onClose: () => {
      if (busy) {
        abortRef.current?.abort();
        return;
      }
      setOpen(false);
    },
  });

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const update = () => {
      const dock = rootRef.current;
      if (!dock) return;
      const mascot = dock.getBoundingClientRect();
      const headerBottom = dock.closest('header')?.getBoundingClientRect().bottom ?? 0;
      setBox(
        listArchitectPanelBox(
          { right: mascot.right, bottom: mascot.bottom },
          headerBottom,
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (busy) return;
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [busy, open, panelRef]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || descriptionInputIssue(text)) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    onDescribe(text, ac.signal);
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const inputIssue = descriptionInputIssue(draft);
  const mood = resolveMascotMood({ busy, error: Boolean(error), hover });

  const panel =
    open && box ? (
      <div
        ref={panelRef}
        className="architect-panel architect-list-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Architect"
        tabIndex={-1}
        style={listArchitectPanelStyle(box)}
      >
        <div className="architect-panel-head">
          <h2>Architect</h2>
        </div>
        <p className="architect-hint">Maps the open process in the editor. Describe one here to create it.</p>
        <label>
          <span className="sr-only">Describe a process</span>
          <textarea
            value={draft}
            disabled={busy}
            maxLength={MAX_DESCRIPTION_CHARS}
            rows={3}
            placeholder="Receive application then screen then interview"
            aria-label="Describe a process to create"
            aria-describedby="architect-description-meta"
            data-modal-initial-focus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
        <div id="architect-description-meta" className="mt-1 flex justify-between gap-3 text-[11px] text-muted">
          <span className={inputIssue ? 'text-danger' : ''}>{inputIssue ?? `Up to ${MAX_DESCRIPTION_CHARS.toLocaleString()} characters`}</span>
          <span className="shrink-0 tabular-nums">{draft.length.toLocaleString()}/{MAX_DESCRIPTION_CHARS.toLocaleString()}</span>
        </div>
        <div className="architect-actions">
          {busy ? (
            <button type="button" className="architect-apply" onClick={cancel}>
              Cancel
            </button>
          ) : (
            <button type="button" className="architect-apply" disabled={!draft.trim() || Boolean(inputIssue)} onClick={submit}>
              Create process
            </button>
          )}
        </div>
        {error ? (
          <p className="architect-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="architect-list-dock">
      <button
        type="button"
        className="architect-mascot-btn"
        aria-label={open ? 'Close Architect' : 'Open Architect'}
        aria-expanded={open}
        onClick={() => {
          if (open && busy) return;
          setOpen((current) => !current);
        }}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <ArchitectMascot mood={mood} collapsed={!open} />
      </button>
      {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </div>
  );
}
