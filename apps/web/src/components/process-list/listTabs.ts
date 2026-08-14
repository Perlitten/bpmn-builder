export const LIST_TABS = ['process', 'template'] as const;

export type ListTab = (typeof LIST_TABS)[number];

export const LIST_SORTS = ['updated_desc', 'updated_asc', 'name_asc', 'name_desc'] as const;

export type ListSort = (typeof LIST_SORTS)[number];

export type ListState = {
  kind: ListTab;
  q: string;
  sort: ListSort;
  page: number;
};

export const LIST_TAB_LABEL: Record<ListTab, string> = {
  process: 'Processes',
  template: 'Templates',
};

export const LIST_PANEL_ID = 'process-list-panel';

export const LIST_TAB_ID: Record<ListTab, string> = {
  process: 'list-tab-processes',
  template: 'list-tab-templates',
};

export function listTabFromSearch(search: string): ListTab {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(raw).get('kind') === 'template' ? 'template' : 'process';
}

export function listStateFromSearch(search: string): ListState {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const requestedSort = params.get('sort');
  const requestedPage = Number.parseInt(params.get('page') ?? '', 10);
  return {
    kind: params.get('kind') === 'template' ? 'template' : 'process',
    q: params.get('q') ?? '',
    sort: LIST_SORTS.includes(requestedSort as ListSort) ? requestedSort as ListSort : 'updated_desc',
    page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

export function searchWithListState(search: string, state: Partial<ListState>): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  if (state.kind) {
    if (state.kind === 'template') params.set('kind', 'template');
    else params.delete('kind');
  }
  if (state.q !== undefined) {
    const q = state.q.trim();
    if (q) params.set('q', q);
    else params.delete('q');
  }
  if (state.sort) {
    if (state.sort === 'updated_desc') params.delete('sort');
    else params.set('sort', state.sort);
  }
  if (state.page !== undefined) {
    if (state.page > 1) params.set('page', String(state.page));
    else params.delete('page');
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function searchWithListTab(search: string, tab: ListTab): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  if (tab === 'template') params.set('kind', 'template');
  else params.delete('kind');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function writeListTab(tab: ListTab): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.search = searchWithListTab(url.search, tab);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function writeListState(state: Partial<ListState>): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.search = searchWithListState(url.search, state);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function nextListTab(current: ListTab, key: string): ListTab | null {
  const i = LIST_TABS.indexOf(current);
  if (key === 'ArrowRight' || key === 'ArrowDown') return LIST_TABS[(i + 1) % LIST_TABS.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return LIST_TABS[(i - 1 + LIST_TABS.length) % LIST_TABS.length];
  }
  if (key === 'Home') return LIST_TABS[0];
  if (key === 'End') return LIST_TABS[LIST_TABS.length - 1];
  return null;
}

export function listRange(total: number, page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.min(Math.max(1, page), lastListPage(total, pageSize));
  return {
    from: total === 0 ? 0 : (safePage - 1) * pageSize + 1,
    to: Math.min(safePage * pageSize, total),
  };
}

export function lastListPage(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}
