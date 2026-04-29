import { describe, expect, it, vi } from 'vitest';

import { MemberWorkSyncNudgeDispatchScheduler } from '@features/member-work-sync/main/infrastructure/MemberWorkSyncNudgeDispatchScheduler';

describe('MemberWorkSyncNudgeDispatchScheduler', () => {
  it('dispatches due nudges for unique active teams without overlapping runs', async () => {
    let release!: () => void;
    const firstDispatch = new Promise<void>((resolve) => {
      release = resolve;
    });
    const dispatchDue = vi.fn(async () => {
      await firstDispatch;
      return { claimed: 1, delivered: 1, superseded: 0, retryable: 0, terminal: 0 };
    });
    const scheduler = new MemberWorkSyncNudgeDispatchScheduler({
      listLifecycleActiveTeamNames: async () => ['team-a', 'team-a', ' ', 'team-b'],
      dispatchDue,
    });

    const first = scheduler.runOnce();
    const second = scheduler.runOnce();
    await Promise.resolve();
    expect(dispatchDue).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);

    expect(dispatchDue).toHaveBeenCalledWith(['team-a', 'team-b']);
  });

  it('skips dispatch when there are no active teams', async () => {
    const dispatchDue = vi.fn();
    const scheduler = new MemberWorkSyncNudgeDispatchScheduler({
      listLifecycleActiveTeamNames: async () => [],
      dispatchDue,
    });

    await scheduler.runOnce();

    expect(dispatchDue).not.toHaveBeenCalled();
  });

  it('logs and survives list failures without throwing', async () => {
    const warn = vi.fn();
    const scheduler = new MemberWorkSyncNudgeDispatchScheduler({
      listLifecycleActiveTeamNames: async () => {
        throw new Error('list failed');
      },
      dispatchDue: vi.fn(),
      logger: {
        debug: vi.fn(),
        warn,
        error: vi.fn(),
      },
    });

    await expect(scheduler.runOnce()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'member work sync scheduled nudge dispatch failed',
      expect.objectContaining({ error: 'Error: list failed' })
    );
  });
});
