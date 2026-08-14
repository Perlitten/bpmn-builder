import { describe, expect, it } from 'vitest';
import { parseProcessListQuery } from './processListQuery.js';

describe('parseProcessListQuery', () => {
  it('defaults to all / recently updated / page 1 / limit 20', () => {
    expect(parseProcessListQuery({})).toEqual({
      ok: true,
      value: { q: '', kind: 'all', sort: 'updated_desc', page: 1, limit: 20 },
    });
  });

  it('reads q, kind, sort, page, and limit', () => {
    expect(
      parseProcessListQuery({
        q: '  onboarding  ',
        kind: 'template',
        sort: 'name_desc',
        page: '2',
        limit: '50',
      }),
    ).toEqual({
      ok: true,
      value: { q: 'onboarding', kind: 'template', sort: 'name_desc', page: 2, limit: 50 },
    });
  });

  it('keeps legacy sort links working while normalizing them to explicit directions', () => {
    expect(parseProcessListQuery({ sort: 'updated' })).toMatchObject({
      ok: true,
      value: { sort: 'updated_desc' },
    });
    expect(parseProcessListQuery({ sort: 'name' })).toMatchObject({
      ok: true,
      value: { sort: 'name_asc' },
    });
  });

  it('rejects invented lifecycle kinds and out-of-range paging', () => {
    expect(parseProcessListQuery({ kind: 'draft' }).ok).toBe(false);
    expect(parseProcessListQuery({ kind: 'published' }).ok).toBe(false);
    expect(parseProcessListQuery({ kind: 'archived' }).ok).toBe(false);
    expect(parseProcessListQuery({ sort: 'created' }).ok).toBe(false);
    expect(parseProcessListQuery({ page: '0' }).ok).toBe(false);
    expect(parseProcessListQuery({ page: '9007199254740991' }).ok).toBe(false);
    expect(parseProcessListQuery({ limit: '101' }).ok).toBe(false);
    expect(parseProcessListQuery({ limit: '0' }).ok).toBe(false);
  });
});
