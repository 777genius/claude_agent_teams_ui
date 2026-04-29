import { describe, expect, it } from 'vitest';

import {
  MemberWorkSyncDiagnosticsReader,
  MemberWorkSyncReporter,
  type MemberWorkSyncAgendaSourceResult,
  type MemberWorkSyncStatusStorePort,
  type MemberWorkSyncUseCaseDeps,
} from '@features/member-work-sync/core/application';
import type {
  MemberWorkSyncActionableWorkItem,
  MemberWorkSyncReportRequest,
  MemberWorkSyncStatus,
} from '@features/member-work-sync/contracts';

const workItem: MemberWorkSyncActionableWorkItem = {
  taskId: 'task-1',
  displayId: '11111111',
  subject: 'Ship sync',
  kind: 'work',
  assignee: 'bob',
  priority: 'normal',
  reason: 'owned_pending_task',
  evidence: {
    status: 'pending',
    owner: 'bob',
  },
};

class MutableClock {
  private current = new Date('2026-04-29T00:00:00.000Z');

  now(): Date {
    return this.current;
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }
}

class InMemoryStatusStore implements MemberWorkSyncStatusStorePort {
  readonly writes: MemberWorkSyncStatus[] = [];
  readonly pendingReports: Array<{ request: MemberWorkSyncReportRequest; reason: string }> = [];

  async read(): Promise<MemberWorkSyncStatus | null> {
    return this.writes.at(-1) ?? null;
  }

  async write(status: MemberWorkSyncStatus): Promise<void> {
    this.writes.push(status);
  }

  async appendPendingReport(request: MemberWorkSyncReportRequest, reason: string): Promise<void> {
    this.pendingReports.push({ request, reason });
  }
}

function createDeps(options?: {
  items?: MemberWorkSyncActionableWorkItem[];
  activeMemberNames?: string[];
  inactive?: boolean;
  providerId?: 'opencode' | 'codex';
}) {
  const clock = new MutableClock();
  const store = new InMemoryStatusStore();
  const source: MemberWorkSyncAgendaSourceResult = {
    agenda: {
      teamName: 'team-a',
      memberName: 'bob',
      generatedAt: '2026-04-29T00:00:00.000Z',
      items: options?.items ?? [workItem],
      diagnostics: [],
    },
    activeMemberNames: options?.activeMemberNames ?? ['bob'],
    inactive: options?.inactive ?? false,
    ...(options?.providerId ? { providerId: options.providerId } : {}),
    diagnostics: [],
  };
  const deps: MemberWorkSyncUseCaseDeps = {
    clock,
    hash: {
      sha256Hex: (value) => `hash-${value.length}`,
    },
    agendaSource: {
      loadAgenda: async () => source,
    },
    statusStore: store,
    reportStore: store,
    reportToken: {
      create: async (input) => ({
        token: `token:${input.teamName}:${input.memberName}:${input.agendaFingerprint}`,
        expiresAt: '2026-04-29T00:15:00.000Z',
      }),
      verify: async (input) =>
        input.token === `token:${input.teamName}:${input.memberName}:${input.agendaFingerprint}`
          ? { ok: true }
          : { ok: false, reason: input.token ? 'invalid' : 'missing' },
    },
  };
  return { clock, deps, source, store };
}

describe('MemberWorkSync use cases', () => {
  it('reconciles actionable work into needs_sync without side effects', async () => {
    const { deps, store } = createDeps();
    const status = await new MemberWorkSyncDiagnosticsReader(deps).execute({
      teamName: 'team-a',
      memberName: 'bob',
    });

    expect(status.state).toBe('needs_sync');
    expect(status.agenda.items).toEqual([workItem]);
    expect(status.diagnostics).toContain('no_current_report');
    expect(store.pendingReports).toEqual([]);
  });

  it('accepts still_working as a bounded lease for the current fingerprint', async () => {
    const { clock, deps } = createDeps();
    const reader = new MemberWorkSyncDiagnosticsReader(deps);
    const reporter = new MemberWorkSyncReporter(deps);
    const current = await reader.execute({ teamName: 'team-a', memberName: 'bob' });

    const result = await reporter.execute({
      teamName: 'team-a',
      memberName: 'bob',
      state: 'still_working',
      agendaFingerprint: current.agenda.fingerprint,
      reportToken: current.reportToken,
      taskIds: ['task-1'],
      leaseTtlMs: 120_000,
      source: 'test',
    });

    expect(result.accepted).toBe(true);
    expect(result.status.state).toBe('still_working');

    clock.set('2026-04-29T00:01:59.000Z');
    expect((await reader.execute({ teamName: 'team-a', memberName: 'bob' })).state).toBe(
      'still_working'
    );

    clock.set('2026-04-29T00:02:00.000Z');
    const expired = await reader.execute({ teamName: 'team-a', memberName: 'bob' });
    expect(expired.state).toBe('needs_sync');
    expect(expired.diagnostics).toContain('report_lease_expired');
  });

  it('rejects stale or unsafe reports and records pending intent only', async () => {
    const { deps, store } = createDeps();
    const result = await new MemberWorkSyncReporter(deps).execute({
      teamName: 'team-a',
      memberName: 'bob',
      state: 'caught_up',
      agendaFingerprint: 'agenda:v1:stale',
      source: 'test',
    });

    expect(result.accepted).toBe(false);
    expect(result.code).toBe('stale_fingerprint');
    expect(result.status.state).toBe('needs_sync');
    expect(store.pendingReports).toHaveLength(1);
    expect(store.pendingReports[0].reason).toBe('stale_fingerprint');
  });

  it('accepts caught_up only when the app-side agenda is empty', async () => {
    const { deps } = createDeps({ items: [] });
    const reader = new MemberWorkSyncDiagnosticsReader(deps);
    const reporter = new MemberWorkSyncReporter(deps);
    const current = await reader.execute({ teamName: 'team-a', memberName: 'bob' });

    const result = await reporter.execute({
      teamName: 'team-a',
      memberName: 'bob',
      state: 'caught_up',
      agendaFingerprint: current.agenda.fingerprint,
      reportToken: current.reportToken,
      source: 'test',
    });

    expect(result.accepted).toBe(true);
    expect(result.status.state).toBe('caught_up');
  });

  it('rejects invalid report tokens without recording replayable intents', async () => {
    const { deps, store } = createDeps();
    const reader = new MemberWorkSyncDiagnosticsReader(deps);
    const reporter = new MemberWorkSyncReporter(deps);
    const current = await reader.execute({ teamName: 'team-a', memberName: 'bob' });

    const result = await reporter.execute({
      teamName: 'team-a',
      memberName: 'bob',
      state: 'still_working',
      agendaFingerprint: current.agenda.fingerprint,
      reportToken: 'token:team-a:alice:wrong',
      source: 'test',
    });

    expect(result.accepted).toBe(false);
    expect(result.code).toBe('invalid_report_token');
    expect(store.pendingReports).toHaveLength(0);
  });
});
