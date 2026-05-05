import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeamTaskReader } from '../../../../src/main/services/team/TeamTaskReader';

import type { TeamTask } from '../../../../src/shared/types/team';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeTask(id: string): TeamTask & { teamName: string } {
  return {
    id,
    subject: id,
    owner: 'alice',
    status: 'pending',
    createdAt: '2026-05-02T12:00:00.000Z',
    updatedAt: '2026-05-02T12:00:00.000Z',
    teamName: 'atlas-hq',
  };
}

describe('TeamTaskReader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TeamTaskReader.invalidateAllTasksCache();
  });

  it('does not reuse or cache a stale in-flight getAllTasks scan after invalidation', async () => {
    const firstRead = createDeferred<(TeamTask & { teamName: string })[]>();
    const secondRead = createDeferred<(TeamTask & { teamName: string })[]>();
    const readAllTasksUncached = vi
      .spyOn(TeamTaskReader.prototype as unknown as { readAllTasksUncached: () => Promise<(TeamTask & { teamName: string })[]> }, 'readAllTasksUncached')
      .mockImplementationOnce(() => firstRead.promise)
      .mockImplementationOnce(() => secondRead.promise);

    const reader = new TeamTaskReader();
    const staleRequest = reader.getAllTasks();
    await Promise.resolve();
    expect(readAllTasksUncached).toHaveBeenCalledTimes(1);

    TeamTaskReader.invalidateAllTasksCache();
    const freshRequest = reader.getAllTasks();
    await Promise.resolve();
    expect(readAllTasksUncached).toHaveBeenCalledTimes(2);

    secondRead.resolve([makeTask('fresh-task')]);
    await expect(freshRequest).resolves.toEqual([makeTask('fresh-task')]);

    firstRead.resolve([makeTask('stale-task')]);
    await staleRequest;

    await expect(reader.getAllTasks()).resolves.toEqual([makeTask('fresh-task')]);
    expect(readAllTasksUncached).toHaveBeenCalledTimes(2);
  });
});
