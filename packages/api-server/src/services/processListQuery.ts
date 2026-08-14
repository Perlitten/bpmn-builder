export const PROCESS_LIST_KINDS = ['all', 'process', 'template'] as const;
export const PROCESS_LIST_SORTS = ['updated_desc', 'updated_asc', 'name_asc', 'name_desc'] as const;

export type ProcessListKind = (typeof PROCESS_LIST_KINDS)[number];
export type ProcessListSort = (typeof PROCESS_LIST_SORTS)[number];

export const PROCESS_LIST_DEFAULT_LIMIT = 20;
export const PROCESS_LIST_MAX_LIMIT = 100;

export type ProcessListQuery = {
  q: string;
  kind: ProcessListKind;
  sort: ProcessListSort;
  page: number;
  limit: number;
};

function firstString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return firstString(value[0]);
  if (typeof value === 'object') return undefined;
  return String(value);
}

function parseBoundedInt(raw: string | undefined, fallback: number, max: number): number | null {
  if (raw == null || raw.trim() === '') return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (n < 1 || n > max) return null;
  return n;
}

export function parseProcessListQuery(
  query: Record<string, unknown> | undefined,
): { ok: true; value: ProcessListQuery } | { ok: false; error: string } {
  const q = (firstString(query?.q) ?? '').trim();

  const kindRaw = (firstString(query?.kind) ?? 'all').trim() || 'all';
  if (!PROCESS_LIST_KINDS.includes(kindRaw as ProcessListKind)) {
    return { ok: false, error: 'kind must be all, process, or template' };
  }

  const requestedSort = (firstString(query?.sort) ?? 'updated_desc').trim() || 'updated_desc';
  const sortRaw = requestedSort === 'updated' ? 'updated_desc' : requestedSort === 'name' ? 'name_asc' : requestedSort;
  if (!PROCESS_LIST_SORTS.includes(sortRaw as ProcessListSort)) {
    return { ok: false, error: 'sort must be updated_desc, updated_asc, name_asc, or name_desc' };
  }

  const page = parseBoundedInt(firstString(query?.page), 1, Number.MAX_SAFE_INTEGER);
  if (page == null) return { ok: false, error: 'page must be a positive integer' };

  const limit = parseBoundedInt(
    firstString(query?.limit),
    PROCESS_LIST_DEFAULT_LIMIT,
    PROCESS_LIST_MAX_LIMIT,
  );
  if (limit == null) {
    return {
      ok: false,
      error: `limit must be an integer between 1 and ${PROCESS_LIST_MAX_LIMIT}`,
    };
  }

  return {
    ok: true,
    value: {
      q,
      kind: kindRaw as ProcessListKind,
      sort: sortRaw as ProcessListSort,
      page,
      limit,
    },
  };
}
