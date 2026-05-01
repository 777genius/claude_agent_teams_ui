import type {
  MemberWorkSyncLoggerPort,
  RuntimeTurnSettledDrainSummary,
} from '../../core/application';

export interface RuntimeTurnSettledDrainSchedulerDeps {
  drain(): Promise<RuntimeTurnSettledDrainSummary>;
  intervalMs?: number;
  logger?: MemberWorkSyncLoggerPort;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  timer.unref?.();
}

export class RuntimeTurnSettledDrainScheduler {
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private disposed = false;

  constructor(private readonly deps: RuntimeTurnSettledDrainSchedulerDeps) {
    this.intervalMs = Math.max(1_000, deps.intervalMs ?? 15_000);
  }

  start(): void {
    if (this.disposed || this.timer) {
      return;
    }
    this.schedule(100);
  }

  async drainNow(): Promise<RuntimeTurnSettledDrainSummary | null> {
    if (this.running || this.disposed) {
      return null;
    }

    this.running = true;
    try {
      return await this.deps.drain();
    } catch (error) {
      this.deps.logger?.warn('runtime turn settled scheduled drain failed', {
        error: String(error),
      });
      return null;
    } finally {
      this.running = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs: number = this.intervalMs): void {
    if (this.disposed) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drainNow().finally(() => this.schedule());
    }, delayMs);
    unrefTimer(this.timer);
  }
}
