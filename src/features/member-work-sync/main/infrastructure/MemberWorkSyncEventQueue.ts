import type { MemberWorkSyncReconcileContext } from '../../core/application/MemberWorkSyncReconciler';
import type { MemberWorkSyncLoggerPort } from '../../core/application';

export type MemberWorkSyncTriggerReason =
  | 'startup_scan'
  | 'config_changed'
  | 'task_changed'
  | 'inbox_changed'
  | 'member_spawned'
  | 'tool_finished'
  | 'runtime_activity'
  | 'turn_settled'
  | 'manual_refresh';

export interface MemberWorkSyncQueueDiagnostics {
  queued: number;
  running: number;
  enqueued: number;
  coalesced: number;
  reconciled: number;
  dropped: number;
  failed: number;
}

interface QueueItem {
  teamName: string;
  memberName: string;
  runAt: number;
  triggerReasons: Set<MemberWorkSyncTriggerReason>;
}

interface RunningItem {
  rerunRequested: boolean;
  triggerReasons: Set<MemberWorkSyncTriggerReason>;
}

export interface MemberWorkSyncEventQueueDeps {
  reconcile(
    input: { teamName: string; memberName: string },
    context: MemberWorkSyncReconcileContext
  ): Promise<void>;
  isTeamActive(teamName: string): Promise<boolean> | boolean;
  quietWindowMs?: number;
  concurrency?: number;
  now?: () => number;
  logger?: MemberWorkSyncLoggerPort;
}

function keyOf(teamName: string, memberName: string): string {
  return `${teamName}\0${memberName.trim().toLowerCase()}`;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  timer.unref?.();
}

export class MemberWorkSyncEventQueue {
  private readonly items = new Map<string, QueueItem>();
  private readonly running = new Map<string, RunningItem>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly quietWindowMs: number;
  private readonly concurrency: number;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private counters = {
    enqueued: 0,
    coalesced: 0,
    reconciled: 0,
    dropped: 0,
    failed: 0,
  };

  constructor(private readonly deps: MemberWorkSyncEventQueueDeps) {
    this.quietWindowMs = deps.quietWindowMs ?? 90_000;
    this.concurrency = Math.max(1, deps.concurrency ?? 2);
    this.now = deps.now ?? Date.now;
  }

  enqueue(input: {
    teamName: string;
    memberName: string;
    triggerReason: MemberWorkSyncTriggerReason;
    runAfterMs?: number;
  }): void {
    if (this.stopped) {
      return;
    }

    const memberName = input.memberName.trim();
    if (!input.teamName.trim() || !memberName) {
      this.counters.dropped += 1;
      return;
    }

    const key = keyOf(input.teamName, memberName);
    const runAt = this.now() + (input.runAfterMs ?? this.quietWindowMs);
    const running = this.running.get(key);
    if (running) {
      running.rerunRequested = true;
      running.triggerReasons.add(input.triggerReason);
      this.counters.coalesced += 1;
      return;
    }

    const existing = this.items.get(key);
    if (existing) {
      existing.triggerReasons.add(input.triggerReason);
      existing.runAt = Math.max(existing.runAt, runAt);
      this.counters.coalesced += 1;
      this.schedule();
      return;
    }

    this.items.set(key, {
      teamName: input.teamName,
      memberName,
      runAt,
      triggerReasons: new Set([input.triggerReason]),
    });
    this.counters.enqueued += 1;
    this.schedule();
  }

  dropTeam(teamName: string): void {
    for (const [key, item] of this.items) {
      if (item.teamName === teamName) {
        this.items.delete(key);
        this.counters.dropped += 1;
      }
    }
    this.schedule();
  }

  getDiagnostics(): MemberWorkSyncQueueDiagnostics {
    return {
      queued: this.items.size,
      running: this.running.size,
      ...this.counters,
    };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.items.clear();
    await Promise.allSettled([...this.inFlight]);
  }

  private schedule(): void {
    if (this.stopped) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.items.size === 0) {
      return;
    }
    if (this.running.size >= this.concurrency) {
      return;
    }

    const nextRunAt = Math.min(...[...this.items.values()].map((item) => item.runAt));
    const delayMs = Math.max(0, nextRunAt - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pump();
    }, delayMs);
    unrefTimer(this.timer);
  }

  private pump(): void {
    if (this.stopped) {
      return;
    }

    const due = [...this.items.entries()]
      .filter(([, item]) => item.runAt <= this.now())
      .sort((left, right) => left[1].runAt - right[1].runAt);

    for (const [key, item] of due) {
      if (this.running.size >= this.concurrency) {
        break;
      }
      this.items.delete(key);
      this.runItem(key, item);
    }

    this.schedule();
  }

  private runItem(key: string, item: QueueItem): void {
    const running: RunningItem = {
      rerunRequested: false,
      triggerReasons: new Set(item.triggerReasons),
    };
    this.running.set(key, running);

    const promise = this.executeItem(key, item, running)
      .catch((error: unknown) => {
        this.counters.failed += 1;
        this.deps.logger?.warn('member work sync queue reconcile failed', {
          teamName: item.teamName,
          memberName: item.memberName,
          error: String(error),
        });
      })
      .finally(() => {
        this.running.delete(key);
        this.inFlight.delete(promise);
        if (running.rerunRequested && !this.stopped) {
          for (const reason of running.triggerReasons) {
            this.enqueue({
              teamName: item.teamName,
              memberName: item.memberName,
              triggerReason: reason,
            });
          }
        }
        this.pump();
      });

    this.inFlight.add(promise);
  }

  private async executeItem(_key: string, item: QueueItem, running: RunningItem): Promise<void> {
    if (!(await this.deps.isTeamActive(item.teamName))) {
      this.counters.dropped += 1;
      return;
    }

    await this.deps.reconcile(
      { teamName: item.teamName, memberName: item.memberName },
      {
        reconciledBy: 'queue',
        triggerReasons: [...running.triggerReasons].sort(),
      }
    );
    this.counters.reconciled += 1;
  }
}
