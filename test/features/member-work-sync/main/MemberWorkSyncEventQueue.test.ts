import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemberWorkSyncEventQueue } from '@features/member-work-sync/main/infrastructure/MemberWorkSyncEventQueue';

describe('MemberWorkSyncEventQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces duplicate member events into one queue reconcile', async () => {
    const reconciles: unknown[] = [];
    const auditEvents: string[] = [];
    const queue = new MemberWorkSyncEventQueue({
      quietWindowMs: 100,
      reconcile: async (request, context) => {
        reconciles.push({ request, context });
      },
      isTeamActive: () => true,
      auditJournal: {
        append: async (event) => {
          auditEvents.push(event.event);
        },
      },
    });

    queue.enqueue({ teamName: 'team-a', memberName: 'bob', triggerReason: 'task_changed' });
    queue.enqueue({ teamName: 'team-a', memberName: 'bob', triggerReason: 'inbox_changed' });

    await vi.advanceTimersByTimeAsync(100);

    expect(reconciles).toHaveLength(1);
    expect(reconciles[0]).toMatchObject({
      request: { teamName: 'team-a', memberName: 'bob' },
      context: {
        reconciledBy: 'queue',
        triggerReasons: ['inbox_changed', 'task_changed'],
      },
    });
    expect(queue.getDiagnostics()).toMatchObject({ reconciled: 1, coalesced: 1 });
    expect(auditEvents).toEqual(['queue_enqueued', 'queue_coalesced', 'queue_reconciled']);
    await queue.stop();
  });

  it('drops queued work for inactive teams without reconciling', async () => {
    const reconcile = vi.fn();
    const queue = new MemberWorkSyncEventQueue({
      quietWindowMs: 1,
      reconcile,
      isTeamActive: () => false,
    });

    queue.enqueue({ teamName: 'team-a', memberName: 'bob', triggerReason: 'task_changed' });
    await vi.advanceTimersByTimeAsync(1);

    expect(reconcile).not.toHaveBeenCalled();
    expect(queue.getDiagnostics()).toMatchObject({ dropped: 1, reconciled: 0 });
    await queue.stop();
  });

  it('runs one follow-up pass when events arrive during an active reconcile', async () => {
    let release: () => void = () => {
      throw new Error('reconcile did not start');
    };
    const reconciles: unknown[] = [];
    const queue = new MemberWorkSyncEventQueue({
      quietWindowMs: 1,
      reconcile: async (request, context) => {
        reconciles.push({ request, context });
        if (reconciles.length === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      },
      isTeamActive: () => true,
    });

    queue.enqueue({ teamName: 'team-a', memberName: 'bob', triggerReason: 'task_changed' });
    await vi.advanceTimersByTimeAsync(1);
    queue.enqueue({ teamName: 'team-a', memberName: 'bob', triggerReason: 'tool_finished' });

    release();
    await vi.advanceTimersByTimeAsync(1);

    expect(reconciles).toHaveLength(2);
    expect(reconciles[1]).toMatchObject({
      context: { reconciledBy: 'queue', triggerReasons: ['task_changed', 'tool_finished'] },
    });
    await queue.stop();
  });

  it('does not spin timers while concurrency is saturated', async () => {
    let release: () => void = () => {
      throw new Error('reconcile did not start');
    };
    const reconciles: unknown[] = [];
    const queue = new MemberWorkSyncEventQueue({
      quietWindowMs: 1,
      concurrency: 1,
      reconcile: async (request) => {
        reconciles.push(request);
        if (reconciles.length === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      },
      isTeamActive: () => true,
    });

    queue.enqueue({ teamName: 'team-a', memberName: 'alice', triggerReason: 'task_changed' });
    queue.enqueue({ teamName: 'team-a', memberName: 'bob', triggerReason: 'task_changed' });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(reconciles).toHaveLength(1);
    expect(queue.getDiagnostics()).toMatchObject({ queued: 1, running: 1 });

    release();
    await vi.advanceTimersByTimeAsync(1);

    expect(reconciles).toHaveLength(2);
    await queue.stop();
  });
});
