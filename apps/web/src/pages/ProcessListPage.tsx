import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import { ArrowRight, Mic } from 'lucide-react';
import { DuplicateProcessDialog } from '../components/process-list/DuplicateProcessDialog';
import { ImportBpmnButton, type ImportBpmnButtonHandle } from '../components/process-list/ImportBpmnButton';
import { ListKindTabs } from '../components/process-list/ListKindTabs';
import { ListPaginationFooter } from '../components/process-list/ListPaginationFooter';
import { MobileProcessCapture } from '../components/process-list/MobileProcessCapture';
import { ProcessComposer } from '../components/process-list/ProcessComposer';
import { ProcessDetailPanel } from '../components/process-list/ProcessDetailPanel';
import { ProcessEmptyState } from '../components/process-list/ProcessEmptyState';
import { ProcessListHeader } from '../components/process-list/ProcessListHeader';
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
import { RenameProcessDialog } from '../components/process-list/RenameProcessDialog';
import { draftNameFromTemplate } from '../components/process-list/TemplatesSection';
import { UserMenu } from '../components/shell/UserMenu';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SelectField } from '../components/ui/SelectField';
import { Skeleton } from '../components/ui/Skeleton';
import { TextField } from '../components/ui/TextField';
import { api, fetchProcess, type ProcessListSort } from '../lib/api';
import { processNameFromBpmn, processNameFromDescription } from '../lib/bpmnPreview';
import { describeBpmnXml, descriptionInputIssue } from '../lib/describeProcess';
import { bpmnDownloadFilename, downloadBpmnXml } from '../lib/downloadBpmn';
import { MAX_DESCRIPTION_CHARS } from '../lib/linearProcess';
import { pageTitle } from '../lib/pageTitle';
import { getBuildVersionInfo } from '../lib/version';
import '../styles/productFonts';
import '../components/process-list/process-list.css';

export const DESCRIPTION_PLACEHOLDER =
  'Receive invoice. Review details. If approved, pay the supplier, otherwise request a revision.';

const PAGE_SIZE = 20;

type ProcessListPageProps = {
  onOpenProcess: (id: string) => void;
};

type MobileFilter = 'all' | 'attention' | 'draft';

export function ProcessListPage({ onOpenProcess }: ProcessListPageProps) {
  const initialListState = useRef(
    listStateFromSearch(typeof window === 'undefined' ? '' : window.location.search),
  ).current;
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [suggestedTemplates, setSuggestedTemplates] = useState<ProcessSummary[]>([]);
  const [query, setQuery] = useState(initialListState.q);
  const [debouncedQuery, setDebouncedQuery] = useState(initialListState.q.trim());
  const [kind, setKind] = useState<ListTab>(initialListState.kind);
  const [sort, setSort] = useState<ProcessListSort>(initialListState.sort);
  const [page, setPage] = useState(initialListState.page);
  const [total, setTotal] = useState(0);
  const [processTotal, setProcessTotal] = useState(0);
  const [templateTotal, setTemplateTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [mobileCapture, setMobileCapture] = useState(false);
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>('all');
  const [prompt, setPrompt] = useState(DESCRIPTION_PLACEHOLDER);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [creating, setCreating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importFailure, setImportFailure] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ file: File; xml: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProcessSummary | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<ProcessSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProcessSummary | null>(null);
  const [rowActionBusy, setRowActionBusy] = useState(false);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const importRef = useRef<ImportBpmnButtonHandle>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const restoreRowFocusOnClose = useRef(false);
  const firstQuerySync = useRef(true);

  useEffect(() => {
    document.title = pageTitle('list');
  }, []);

  useEffect(() => {
    if (previewOpen || !restoreRowFocusOnClose.current) return;
    restoreRowFocusOnClose.current = false;
    selectedRowRef.current?.focus();
  }, [previewOpen]);

  useEffect(() => {
    const ac = new AbortController();
    void api.listTemplates({ sort: 'name_asc', page: 1, limit: 3 }, ac.signal)
      .then((data) => {
        setSuggestedTemplates(data.processes);
        setTemplateTotal(data.total);
      })
      .catch((err: unknown) => {
        if (!isAbort(err)) setSuggestedTemplates([]);
      });
    return () => ac.abort();
  }, [reloadToken]);

  useEffect(() => {
    if (firstQuerySync.current) {
      firstQuerySync.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
      setMobileDetail(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    writeListState({ kind, q: debouncedQuery, sort, page });
  }, [debouncedQuery, kind, sort, page]);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    setLoadError(null);
    setLoading(true);
    const request = kind === 'template'
      ? api.listTemplates({ q: debouncedQuery, sort, page, limit: PAGE_SIZE }, ac.signal)
      : api.listProcesses({ q: debouncedQuery, kind: 'process', sort, page, limit: PAGE_SIZE }, ac.signal);

    void request
      .then((data) => {
        if (cancelled) return;
        const lastPage = lastListPage(data.total, PAGE_SIZE);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setProcesses(data.processes);
        setTotal(data.total);
        if (kind === 'process') setProcessTotal(data.total);
        setSelectedId((current) => (
          data.processes.some((process) => process.id === current)
            ? current
            : data.processes[0]?.id ?? null
        ));
      })
      .catch((err: unknown) => {
        if (cancelled || isAbort(err)) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load processes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [debouncedQuery, kind, sort, page, reloadToken]);

  const attentionCount = useMemo(
    () => processes.filter((process) => process.quality.errors + process.quality.warnings > 0).length,
    [processes],
  );
  const draftCount = useMemo(
    () => processes.filter((process) => process.status === 'draft').length,
    [processes],
  );
  const visibleProcesses = useMemo(() => {
    if (kind !== 'process' || mobileFilter === 'all') return processes;
    if (mobileFilter === 'draft') return processes.filter((process) => process.status === 'draft');
    return processes.filter((process) => process.quality.errors + process.quality.warnings > 0);
  }, [kind, mobileFilter, processes]);
  const selectedProcess = visibleProcesses.find((process) => process.id === selectedId) ?? visibleProcesses[0] ?? null;

  const selectTab = (next: ListTab) => {
    setKind(next);
    setPage(1);
    setProcesses([]);
    setTotal(0);
    setSelectedId(null);
    setMobileDetail(false);
    setMobileFilter('all');
    writeListTab(next);
  };

  const createAndOpen = async (
    input: { name: string; description?: string; bpmnXml?: string; templateId?: string },
    imported?: { file: File; xml: string },
    signal?: AbortSignal,
  ) => {
    setCreating(true);
    setActionError(null);
    setImportFailure(null);
    try {
      const created = await api.createProcess(input, signal);
      setPendingImport(null);
      setImportFailure(null);
      setMobileCapture(false);
      onOpenProcess(created.id);
    } catch (err) {
      if (isAbort(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to create process';
      if (imported) {
        setPendingImport(imported);
        setImportFailure(message);
      } else {
        setActionError(message);
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
      setActionError(err instanceof Error ? err.message : 'Could not create BPMN from this description');
    }
  };

  const handleRename = async (name: string) => {
    if (!renameTarget) return;
    setRowActionBusy(true);
    setRowActionError(null);
    try {
      const renamed = await api.renameProcess(renameTarget.id, name, renameTarget.version);
      setProcesses((current) => current.map((process) => (
        process.id === renamed.id
          ? { ...process, name: renamed.name, updatedAt: renamed.updatedAt, version: renamed.version }
          : process
      )));
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
    const deletingId = deleteTarget.id;
    setRowActionBusy(true);
    setRowActionError(null);
    try {
      await api.deleteProcess(deletingId);
      const nextTotal = Math.max(0, total - 1);
      const lastPage = lastListPage(nextTotal, PAGE_SIZE);
      setDeleteTarget(null);
      setTotal(nextTotal);
      setProcesses((current) => {
        const next = current.filter((process) => process.id !== deletingId);
        setSelectedId((selected) => selected === deletingId ? next[0]?.id ?? null : selected);
        return next;
      });
      setMobileDetail(false);
      if (page > lastPage) setPage(lastPage);
      else setReloadToken((current) => current + 1);
    } catch (err) {
      setRowActionError(err instanceof Error ? err.message : 'Failed to delete process');
    } finally {
      setRowActionBusy(false);
    }
  };

  const handleExport = async (process: ProcessSummary) => {
    setExportingId(process.id);
    setActionError(null);
    try {
      const { process: fullProcess } = await fetchProcess(process.id);
      downloadBpmnXml(fullProcess.bpmnXml, bpmnDownloadFilename(fullProcess.name));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to export BPMN');
    } finally {
      setExportingId(null);
    }
  };

  const handleImport = (file: File, xml: string) => {
    void createAndOpen({ name: processNameFromBpmn(xml, file.name), bpmnXml: xml }, { file, xml });
  };

  const handleRetryImport = () => {
    if (pendingImport) {
      handleImport(pendingImport.file, pendingImport.xml);
      return;
    }
    setImportFailure(null);
    importRef.current?.open();
  };

  const useTemplate = (template: ProcessSummary) => {
    void createAndOpen({ name: draftNameFromTemplate(template.name), templateId: template.id });
  };

  const { from, to } = listRange(total, page, PAGE_SIZE);
  const searching = Boolean(debouncedQuery);
  const promptIssue = descriptionInputIssue(prompt);
  const initialLoading = loading && processes.length === 0;
  const fullEmptyState = !initialLoading && !loadError && kind === 'process' && !searching && total === 0;

  return (
    <div className={`process-list-page ${previewOpen && mobileDetail && selectedProcess ? 'is-mobile-detail' : ''}`}>
      <ProcessListHeader
        query={query}
        total={total}
        empty={fullEmptyState}
        buildVersion={getBuildVersionInfo()}
        searchLabel={kind === 'template' ? 'Search templates' : 'Search processes'}
        onQueryChange={setQuery}
        actions={(
          <div className="process-list-primary-actions">
            <ImportBpmnButton
              ref={importRef}
              disabled={creating}
              onImport={handleImport}
              onError={(message) => {
                setPendingImport(null);
                setImportFailure(message);
              }}
            />
            <Button variant="outline" size="sm" disabled={creating} onClick={() => void createAndOpen({ name: 'Untitled process' })}>
              New blank
            </Button>
          </div>
        )}
        account={<UserMenu compact />}
      />

      {(loadError || actionError) && !importFailure ? (
        <div className="process-list-error" role="alert">
          <span>{loadError ?? actionError}</span>
          {loadError ? (
            <Button variant="outline" size="sm" onClick={() => setReloadToken((current) => current + 1)}>Retry</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setActionError(null)}>Dismiss</Button>
          )}
        </div>
      ) : null}

      {fullEmptyState ? (
        <ProcessEmptyState
          value={prompt}
          issue={promptIssue}
          busy={creating}
          placeholder={DESCRIPTION_PLACEHOLDER}
          templates={suggestedTemplates}
          onChange={setPrompt}
          onCreate={() => handleDescribe(prompt)}
          onUseTemplate={useTemplate}
        />
      ) : (
        <div className={`process-workbench ${previewOpen ? '' : 'is-list-only'} ${previewOpen && mobileDetail && selectedProcess ? 'is-mobile-detail' : ''}`}>
          <section className="process-index" aria-label={kind === 'template' ? 'Templates' : 'Processes'}>
            <ProcessComposer
              value={prompt}
              issue={promptIssue}
              busy={creating}
              maxLength={MAX_DESCRIPTION_CHARS}
              placeholder={DESCRIPTION_PLACEHOLDER}
              onChange={setPrompt}
              onCreate={() => handleDescribe(prompt)}
            />

            <div className="process-index-toolbar">
              <h1 className="sr-only">{kind === 'template' ? 'Templates' : 'Processes'}</h1>
              <ListKindTabs
                kind={kind}
                counts={{ process: processTotal, template: templateTotal }}
                onChange={selectTab}
              />
              <SelectField
                value={sort}
                aria-label={kind === 'template' ? 'Sort templates' : 'Sort processes'}
                className="process-index-sort"
                onChange={(event) => {
                  setSort(event.target.value as ProcessListSort);
                  setPage(1);
                }}
              >
                <option value="updated_desc">Recent</option>
                <option value="updated_asc">Oldest</option>
                <option value="name_asc">A–Z</option>
                <option value="name_desc">Z–A</option>
              </SelectField>
            </div>

            {kind === 'process' ? (
              <div className="process-list-mobile-filter" aria-label="Process filters for this page">
                <button type="button" aria-pressed={mobileFilter === 'all'} onClick={() => setMobileFilter('all')}>
                  All {processes.length}
                </button>
                <button type="button" data-tone="error" aria-pressed={mobileFilter === 'attention'} onClick={() => setMobileFilter('attention')}>
                  Attention {attentionCount}
                </button>
                <button type="button" aria-pressed={mobileFilter === 'draft'} onClick={() => setMobileFilter('draft')}>
                  Drafts {draftCount}
                </button>
                <span className="process-list-mobile-filter-scope">This page</span>
              </div>
            ) : null}

            <div
              id={LIST_PANEL_ID}
              role="tabpanel"
              aria-labelledby={LIST_TAB_ID[kind]}
              aria-busy={loading}
              className="process-index-list product-scrollbar"
            >
              {initialLoading ? (
                <div role="status" aria-label="Loading processes">
                  {[0, 1, 2, 3, 4].map((key) => (
                    <div key={key} className="process-index-skeleton">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="ml-auto h-3 w-12" />
                    </div>
                  ))}
                </div>
              ) : visibleProcesses.length === 0 ? (
                <div className="process-index-empty">
                  <p>{emptyCopy(kind, searching, mobileFilter)}</p>
                  {searching ? (
                    <Button variant="outline" size="sm" onClick={() => setQuery('')}>Clear search</Button>
                  ) : mobileFilter !== 'all' ? (
                    <Button variant="outline" size="sm" onClick={() => setMobileFilter('all')}>Show all</Button>
                  ) : null}
                </div>
              ) : (
                <div className={loading ? 'opacity-60 transition-opacity' : ''}>
                  {visibleProcesses.map((process) => (
                    <ProcessRow
                      key={process.id}
                      process={process}
                      selected={previewOpen && process.id === selectedProcess?.id}
                      focusRef={process.id === selectedProcess?.id ? selectedRowRef : undefined}
                      onOpen={(id) => {
                        setSelectedId(id);
                        setPreviewOpen(true);
                        setMobileDetail(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <ListPaginationFooter
              className="process-index-pagination"
              from={from}
              to={to}
              total={total}
              page={page}
              pageSize={PAGE_SIZE}
              onPrev={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => current + 1)}
            />

            <div className="process-mobile-composer">
              <TextField
                readOnly
                value=""
                placeholder="Describe a process…"
                aria-label="Describe a new process"
                onFocus={() => setMobileCapture(true)}
                onClick={() => setMobileCapture(true)}
              />
              <Button variant="outline" size="md" aria-label="Dictate a process" onClick={() => setMobileCapture(true)}>
                <Mic size={17} strokeWidth={1.8} aria-hidden="true" />
              </Button>
              <Button variant="accentSolid" size="md" aria-label="Create a process" onClick={() => setMobileCapture(true)}>
                <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
              </Button>
            </div>
          </section>

          {previewOpen && selectedProcess ? (
            <ProcessDetailPanel
              process={selectedProcess}
              kind={kind}
              busy={rowActionBusy || creating}
              exporting={exportingId === selectedProcess.id}
              onBack={() => setMobileDetail(false)}
              onClose={() => {
                restoreRowFocusOnClose.current = true;
                setPreviewOpen(false);
                setMobileDetail(false);
              }}
              onOpenEditor={kind === 'process' || !selectedProcess.builtin ? onOpenProcess : undefined}
              onUseTemplate={kind === 'template' ? useTemplate : undefined}
              onDuplicate={kind === 'process' ? setDuplicateTarget : undefined}
              onExport={kind === 'process' || !selectedProcess.builtin ? (process) => void handleExport(process) : undefined}
              onRename={!selectedProcess.builtin ? setRenameTarget : undefined}
              onDelete={!selectedProcess.builtin ? setDeleteTarget : undefined}
              onRegenerate={(description) => handleDescribe(description)}
            />
          ) : previewOpen ? (
            <div className="process-detail-placeholder">
              <p>Select a process to inspect its diagram, checks, and source description.</p>
            </div>
          ) : null}
        </div>
      )}

      {mobileCapture ? (
        <MobileProcessCapture
          initialValue={prompt}
          templates={suggestedTemplates}
          busy={creating}
          error={actionError}
          onClose={() => setMobileCapture(false)}
          onCreate={(description) => {
            setPrompt(description);
            handleDescribe(description);
          }}
          onUseTemplate={useTemplate}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(importFailure)}
        role="alertdialog"
        title="Could not import BPMN"
        body={importFailure ?? ''}
        confirmLabel="Retry"
        onConfirm={handleRetryImport}
        onCancel={() => {
          setImportFailure(null);
          setPendingImport(null);
        }}
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

function emptyCopy(kind: ListTab, searching: boolean, filter: MobileFilter): string {
  if (kind === 'template') {
    return searching
      ? 'No templates match this search.'
      : 'No templates yet. Save a process as a template from the editor.';
  }
  if (searching) return 'No processes match this search.';
  if (filter === 'attention') return 'No processes on this page need attention.';
  if (filter === 'draft') return 'No draft processes on this page.';
  return 'No processes yet.';
}

function isAbort(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
