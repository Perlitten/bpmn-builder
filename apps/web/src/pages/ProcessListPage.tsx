import { useEffect, useRef, useState } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import { ListArchitect } from '../components/bpmn-editor/architect/ListArchitect';
import { ImportBpmnButton, type ImportBpmnButtonHandle } from '../components/process-list/ImportBpmnButton';
import { ListKindTabs } from '../components/process-list/ListKindTabs';
import { ListPaginationFooter } from '../components/process-list/ListPaginationFooter';
import {
  LIST_PANEL_ID,
  LIST_TAB_ID,
  lastListPage,
  listRange,
  listStateFromSearch,
  writeListTab,
  writeListState,
  type ListTab,
} from '../components/process-list/listTabs';
import { ProcessRow } from '../components/process-list/ProcessRow';
import { DuplicateProcessDialog } from '../components/process-list/DuplicateProcessDialog';
import { RenameProcessDialog } from '../components/process-list/RenameProcessDialog';
import { draftNameFromTemplate, TemplatesSection } from '../components/process-list/TemplatesSection';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Skeleton } from '../components/ui/Skeleton';
import { UserMenu } from '../components/shell/UserMenu';
import { api, type ProcessListSort } from '../lib/api';
import { processNameFromBpmn, processNameFromDescription } from '../lib/bpmnPreview';
import { describeBpmnXml, descriptionInputIssue } from '../lib/describeProcess';
import { MAX_DESCRIPTION_CHARS } from '../lib/linearProcess';
import { pageTitle } from '../lib/pageTitle';
import { getBuildVersionInfo } from '../lib/version';

const PAGE_SIZE = 20;

type ProcessListPageProps = {
  onOpenProcess: (id: string) => void;
};

export function ProcessListPage({ onOpenProcess }: ProcessListPageProps) {
  const initialListState = useRef(
    listStateFromSearch(typeof window === 'undefined' ? '' : window.location.search),
  ).current;
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [query, setQuery] = useState(initialListState.q);
  const [debouncedQuery, setDebouncedQuery] = useState(initialListState.q.trim());
  const [kind, setKind] = useState<ListTab>(initialListState.kind);
  const [sort, setSort] = useState<ProcessListSort>(initialListState.sort);
  const [page, setPage] = useState(initialListState.page);
  const [total, setTotal] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importFailure, setImportFailure] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ file: File; xml: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProcessSummary | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<ProcessSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProcessSummary | null>(null);
  const [rowActionBusy, setRowActionBusy] = useState(false);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const importRef = useRef<ImportBpmnButtonHandle>(null);
  const firstQuerySync = useRef(true);

  useEffect(() => {
    document.title = pageTitle('list');
  }, []);

  useEffect(() => {
    if (firstQuerySync.current) {
      firstQuerySync.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    writeListState({ kind, q: debouncedQuery, sort, page });
  }, [debouncedQuery, kind, sort, page]);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    setError(null);
    setLoading(true);
    void api
      .listProcesses({ q: debouncedQuery, kind, sort, page, limit: PAGE_SIZE }, ac.signal)
      .then((data) => {
        if (cancelled) return;
        const lastPage = lastListPage(data.total, PAGE_SIZE);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setProcesses(data.processes);
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        if (cancelled || isAbort(err)) return;
        setError(err instanceof Error ? err.message : 'Failed to load processes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [debouncedQuery, kind, sort, page, reloadToken]);

  const selectTab = (next: ListTab) => {
    setKind(next);
    setPage(1);
    setProcesses([]);
    setTotal(0);
    writeListTab(next);
  };

  const createAndOpen = async (
    input: {
      name: string;
      description?: string;
      bpmnXml?: string;
      templateId?: string;
    },
    imported?: { file: File; xml: string },
    signal?: AbortSignal,
  ) => {
    setCreating(true);
    setError(null);
    setImportFailure(null);
    try {
      const created = await api.createProcess(input, signal);
      setPendingImport(null);
      setImportFailure(null);
      onOpenProcess(created.id);
    } catch (err) {
      if (isAbort(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to create process';
      if (imported) {
        setPendingImport(imported);
        setImportFailure(message);
      } else {
        setError(message);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDescribe = (text: string, signal?: AbortSignal) => {
    const description = text.trim();
    if (!description) return;
    try {
      const name = processNameFromDescription(description);
      const bpmnXml = describeBpmnXml(name, description);
      void createAndOpen({ name, description, bpmnXml }, undefined, signal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create BPMN from this description');
    }
  };

  const handleRename = async (name: string) => {
    if (!renameTarget) return;
    setRowActionBusy(true);
    setRowActionError(null);
    try {
      const renamed = await api.renameProcess(renameTarget.id, name, renameTarget.version);
      setProcesses((current) => current.map((process) =>
        process.id === renamed.id
          ? { ...process, name: renamed.name, updatedAt: renamed.updatedAt, version: renamed.version }
          : process,
      ));
      setRenameTarget(null);
      setReloadToken((current) => current + 1);
    } catch (err) {
      setRowActionError(err instanceof Error ? err.message : 'Failed to rename process');
    } finally {
      setRowActionBusy(false);
    }
  };

  const handleDuplicate = async (name: string) => {
    if (!duplicateTarget) return;
    setRowActionBusy(true);
    setRowActionError(null);
    try {
      await api.duplicateProcess(duplicateTarget.id, name);
      setDuplicateTarget(null);
      setReloadToken((current) => current + 1);
    } catch (err) {
      setRowActionError(err instanceof Error ? err.message : 'Failed to duplicate process');
    } finally {
      setRowActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setRowActionBusy(true);
    setRowActionError(null);
    try {
      await api.deleteProcess(deleteTarget.id);
      const nextTotal = Math.max(0, total - 1);
      const lastPage = lastListPage(nextTotal, PAGE_SIZE);
      setDeleteTarget(null);
      setTotal(nextTotal);
      setProcesses((current) => current.filter((process) => process.id !== deleteTarget.id));
      if (page > lastPage) setPage(lastPage);
      else setReloadToken((current) => current + 1);
    } catch (err) {
      setRowActionError(err instanceof Error ? err.message : 'Failed to delete process');
    } finally {
      setRowActionBusy(false);
    }
  };

  const handleImport = (file: File, xml: string) => {
    void createAndOpen({ name: processNameFromBpmn(xml, file.name), bpmnXml: xml }, { file, xml });
  };

  const handleImportFileError = (message: string) => {
    setPendingImport(null);
    setImportFailure(message);
  };

  const clearImportFailure = () => {
    setImportFailure(null);
    setPendingImport(null);
  };

  const handleRetryImport = () => {
    if (pendingImport) {
      handleImport(pendingImport.file, pendingImport.xml);
      return;
    }
    setImportFailure(null);
    importRef.current?.open();
  };

  const { from, to } = listRange(total, page, PAGE_SIZE);
  const searching = Boolean(debouncedQuery);
  const promptIssue = descriptionInputIssue(prompt);
  const initialLoading = loading && processes.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="sticky top-0 z-20 shrink-0 overflow-visible border-b border-border bg-canvas">
        <div className="flex min-h-12 items-center gap-3 overflow-visible px-4 py-1.5">
          <span className="text-sm font-semibold tracking-tight text-ink">BPMN</span>
          <span className="hidden font-mono text-[11px] text-muted sm:inline">{getBuildVersionInfo()}</span>
          <label className="ml-auto flex min-w-0 max-w-xs flex-1 items-center">
            <span className="sr-only">{kind === 'template' ? 'Search templates' : 'Search processes'}</span>
            <input
              value={query}
              placeholder="Search"
              className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ListArchitect busy={creating} error={error} onDescribe={handleDescribe} />
          <ImportBpmnButton
            ref={importRef}
            disabled={creating}
            onImport={handleImport}
            onError={handleImportFileError}
          />
          <Button
            variant="accent"
            size="sm"
            disabled={creating}
            onClick={() => void createAndOpen({ name: 'Untitled process' })}
          >
            New blank
          </Button>
          <UserMenu />
        </div>
        <div className="border-t border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <input
              value={prompt}
              maxLength={MAX_DESCRIPTION_CHARS}
              placeholder="Describe the process. Text is saved as the description."
              aria-label="Describe the process. Text is saved as the description."
              className="min-w-0 flex-1 rounded border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !promptIssue) handleDescribe(prompt);
              }}
            />
            <Button
              variant="primary"
              size="sm"
              disabled={creating || !prompt.trim() || Boolean(promptIssue)}
              onClick={() => handleDescribe(prompt)}
            >
              Create process
            </Button>
          </div>
          <div className="mt-1.5 flex justify-between gap-3 text-[11px] text-muted">
            <span className={promptIssue ? 'text-danger' : ''}>
              {promptIssue ?? 'Newlines and sequence words become tasks; one decision or parallel group is supported.'}
            </span>
            <span className="shrink-0 tabular-nums">{prompt.length.toLocaleString()}/{MAX_DESCRIPTION_CHARS.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {error && !importFailure ? (
        <p className="shrink-0 px-4 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="sr-only">{kind === 'template' ? 'Templates' : 'Processes'}</h1>
        <ListKindTabs kind={kind} onChange={selectTab} />
        <label className="ml-auto flex items-center gap-2 py-1.5 text-[12px] text-muted">
          <span>Sort by</span>
          <select
            value={sort}
            aria-label={kind === 'template' ? 'Sort templates' : 'Sort processes'}
            className="rounded border border-border bg-canvas px-2 py-1 text-[12px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onChange={(event) => {
              setSort(event.target.value as ProcessListSort);
              setPage(1);
            }}
          >
            <option value="updated_desc">Recently updated</option>
            <option value="updated_asc">Least recently updated</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
          </select>
        </label>
      </div>

      <div
        id={LIST_PANEL_ID}
        role="tabpanel"
        aria-labelledby={LIST_TAB_ID[kind]}
        aria-busy={loading}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {initialLoading ? (
          <div>
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Skeleton className="h-3 w-40 rounded-sm" />
                <Skeleton className="h-3 flex-1 rounded-sm" />
                <Skeleton className="h-3 w-16 rounded-sm" />
              </div>
            ))}
          </div>
        ) : processes.length === 0 ? (
          <div className="px-4 py-8">
            <p className="text-sm text-muted">{emptyCopy(kind, searching)}</p>
            {searching ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setQuery('')}>
                Clear search
              </Button>
            ) : kind === 'process' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={creating}
                  onClick={() => void createAndOpen({ name: 'Untitled process' })}
                >
                  Create blank
                </Button>
                <ImportBpmnButton disabled={creating} onImport={handleImport} onError={handleImportFileError} />
              </div>
            ) : null}
          </div>
        ) : kind === 'template' ? (
          <TemplatesSection
            templates={processes}
            busy={creating}
            onOpen={onOpenProcess}
            onUse={(template) =>
              void createAndOpen({
                name: draftNameFromTemplate(template.name),
                templateId: template.id,
              })
            }
          />
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            {processes.map((process) => (
              <ProcessRow
                key={process.id}
                process={process}
                onOpen={onOpenProcess}
                onRename={setRenameTarget}
                onDuplicate={setDuplicateTarget}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      <ListPaginationFooter
        from={from}
        to={to}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPrev={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />

      <ConfirmDialog
        open={Boolean(importFailure)}
        role="alertdialog"
        title="Could not import BPMN"
        body={importFailure ?? ''}
        confirmLabel="Retry"
        onConfirm={handleRetryImport}
        onCancel={clearImportFailure}
      />

      <RenameProcessDialog
        process={renameTarget}
        busy={rowActionBusy}
        error={renameTarget ? rowActionError : null}
        onRename={(name) => void handleRename(name)}
        onClose={() => {
          if (rowActionBusy) return;
          setRenameTarget(null);
          setRowActionError(null);
        }}
      />

      <DuplicateProcessDialog
        process={duplicateTarget}
        busy={rowActionBusy}
        error={duplicateTarget ? rowActionError : null}
        onConfirm={(name) => void handleDuplicate(name)}
        onClose={() => {
          if (rowActionBusy) return;
          setDuplicateTarget(null);
          setRowActionError(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        role="alertdialog"
        title="Delete process?"
        body={rowActionError ?? `“${deleteTarget?.name ?? ''}” will be permanently deleted.`}
        confirmLabel={rowActionError ? 'Retry' : 'Delete'}
        busy={rowActionBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (rowActionBusy) return;
          setDeleteTarget(null);
          setRowActionError(null);
        }}
      />
    </div>
  );
}

function emptyCopy(kind: ListTab, searching: boolean): string {
  if (kind === 'template') {
    return searching
      ? 'No templates match this search.'
      : 'No templates yet. Save a process as a template from the editor.';
  }
  return searching
    ? 'No processes match this search.'
    : 'No processes yet. Describe one above, create a blank Start → Task → End, or import BPMN 2.0.';
}

function isAbort(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
