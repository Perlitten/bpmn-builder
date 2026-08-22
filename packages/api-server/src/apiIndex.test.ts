import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  migrate: vi.fn<() => Promise<void>>(),
  seedIfEmpty: vi.fn<() => Promise<void>>(),
  repairEmptyDiagrams: vi.fn<() => Promise<void>>(),
}));

vi.mock('@bpmn/db', () => ({ migrate: mocks.migrate }));
vi.mock('./seed.js', () => ({
  seedIfEmpty: mocks.seedIfEmpty,
  repairEmptyDiagrams: mocks.repairEmptyDiagrams,
}));

import { initializeDatabase, resetDatabaseInitializationForTests } from '../../../api/index.js';

describe('serverless database initialization', () => {
  beforeEach(() => {
    resetDatabaseInitializationForTests();
    mocks.migrate.mockReset();
    mocks.seedIfEmpty.mockReset().mockResolvedValue(undefined);
    mocks.repairEmptyDiagrams.mockReset().mockResolvedValue(undefined);
  });

  it('retries after a failed cold-start initialization', async () => {
    mocks.migrate
      .mockRejectedValueOnce(new Error('temporary database outage'))
      .mockResolvedValueOnce(undefined);

    await expect(initializeDatabase()).rejects.toThrow('temporary database outage');
    await expect(initializeDatabase()).resolves.toBeUndefined();

    expect(mocks.migrate).toHaveBeenCalledTimes(2);
    expect(mocks.seedIfEmpty).toHaveBeenCalledTimes(1);
    expect(mocks.repairEmptyDiagrams).toHaveBeenCalledTimes(1);
  });
});
