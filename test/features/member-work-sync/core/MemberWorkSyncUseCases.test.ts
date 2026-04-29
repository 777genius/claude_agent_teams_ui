import { describe, expect, it } from 'vitest';

import {
  MemberWorkSyncDiagnosticsReader,
  MemberWorkSyncPendingReportIntentReplayer,
  MemberWorkSyncReporter,
  type MemberWorkSyncAgendaSourceResult,
  type MemberWorkSyncStatusStorePort,
  type MemberWorkSyncUseCaseDeps,
} from '@features/member-work-sync/core/application';
import type {
  MemberWorkSyncActionableWorkItem,
  MemberWorkSyncReportIntent,
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
  readonly pendingIntents = new Map<string, MemberWorkSyncReportIntent>();

  async read(): Promise<MemberWorkSyncStatus | null> {
    return this.writes.at(-1) ?? null;
  }

  async write(status: MemberWorkSyncStatus): Promise<void> {
    this.writes.push(status);
  }

  async appendPendingReport(request: MemberWorkSyncReportRequest, reason: string): Promise<void> {
    this.pendingReports.push({ request, reason });
  }

  async listPendingReports(): Promise<MemberWorkSyncReportIntent[]> {
    return [...this.pendingIntents.values()].filter((intent) => intent.status === 'pending');
  }

  async markPendingReportProcessed(
    _teamName: string,
    id: string,
    result: {
      status: MemberWorkSyncReportIntent['status'];
      resultCode: string;
      processedAt: string;
    }
  ): Promise<void> {
    const current = this.pendingIntents.get(id);
    if (current) {
      this.pendingIntents.set(id, { ...current, ...result });
    }
  }
}

function createDeps(options?: {
  items?: MemberWorkSyncActionableWorkItem[];
  activeMemberNames?: string[];
  inactive?: boolean;
  teamActive?: boolean;
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
    lifecycle: {
      isTeamActive: () => options?.teamActive ?? true,
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
    expect(status.reportToken).toBe(`token:team-a:bob:${status.agenda.fingerprint}`);
    expect(status.shadow).toMatchObject({
      reconciledBy: 'request',
      wouldNudge: true,
      fingerprintChanged: false,
    });
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
    expect(result.status.shadow).toMatchObject({ reconciledBy: 'report', wouldNudge: false });

    clock.set('2026-04-29T00:01:59.000Z');
    expect((await reader.execute({ teamName: 'team-a', memberName: 'bob' })).state).toBe(
      'still_working'
    );

    clock.set('2026-04-29T00:02:00.000Z');
    const expired = await reader.execute({ teamName: 'team-a', memberName: 'bob' });
    expect(expired.state).toBe('needs_sync');
    expect(expired.diagnostics).toContain('report_lease_expired');
  });

  it('uses app clock instead of model supplied reportedAt for lease timing', async () => {
    const { deps } = createDeps();
    const reader = new MemberWorkSyncDiagnosticsReader(deps);
    const reporter = new MemberWorkSyncReporter(deps);
    const current = await reader.execute({ teamName: 'team-a', memberName: 'bob' });

    const result = await reporter.execute({
      teamName: 'team-a',
      memberName: 'bob',
      state: 'still_working',
      agendaFingerprint: current.agenda.fingerprint,
      reportToken: current.reportToken,
      reportedAt: '2099-01-01T00:00:00.000Z',
      leaseTtlMs: 120_000,
      source: 'test',
    });

    expect(result.accepted).toBe(true);
    expect(result.status.report?.reportedAt).toBe('2026-04-29T00:00:00.000Z');
    expect(result.status.report?.expiresAt).toBe('2026-04-29T00:02:00.000Z');
  });

  it('rejects stale reports without turning app-side validation failures into pending intents', async () => {
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
    expect(result.status.report).toMatchObject({
      accepted: false,
      rejectionCode: 'stale_fingerprint',
      agendaFingerprint: 'agenda:v1:stale',
    });
    expect(store.writes.at(-1)?.diagnostics).toContain('report_rejected:stale_fingerprint');
    expect(store.pendingReports).toHaveLength(0);
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

  it('marks status inactive when the team runtime is not active', async () => {
    const { deps } = createDeps({ teamActive: false });
    const status = await new MemberWorkSyncDiagnosticsReader(deps).execute({
      teamName: 'team-a',
      memberName: 'bob',
    });

    expect(status.state).toBe('inactive');
    expect(status.diagnostics).toContain('team_runtime_inactive');
    expect(status.shadow?.wouldNudge).toBe(false);
  });

  it('records fingerprint transitions without treating them as progress proof', async () => {
    const { deps, source } = createDeps();
    const reader = new MemberWorkSyncDiagnosticsReader(deps);
    await reader.execute({ teamName: 'team-a', memberName: 'bob' });

    source.agenda.items = [
      {
        ...workItem,
        taskId: 'task-2',
        displayId: '22222222',
        subject: 'New work',
      },
    ];
    const changed = await reader.execute({ teamName: 'team-a', memberName: 'bob' });

    expect(changed.shadow).toMatchObject({
      fingerprintChanged: true,
      wouldNudge: true,
    });
    expect(changed.shadow?.previousFingerprint).toMatch(/^agenda:v1:/);
    expect(changed.state).toBe('needs_sync');
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
    expect(result.status.report).toMatchObject({
      accepted: false,
      rejectionCode: 'invalid_report_token',
    });
    expect(store.pendingReports).toHaveLength(0);
  });

  it('replays pending controller intents through the same app validator', async () => {
    const { deps, store } = createDeps();
    const reader = new MemberWorkSyncDiagnosticsReader(deps);
    const current = await reader.execute({ teamName: 'team-a', memberName: 'bob' });
    store.pendingIntents.set('intent-1', {
      id: 'intent-1',
      teamName: 'team-a',
      memberName: 'bob',
      status: 'pending',
      reason: 'control_api_unavailable',
      recordedAt: '2026-04-29T00:00:01.000Z',
      request: {
        teamName: 'team-a',
        memberName: 'bob',
        state: 'still_working',
        agendaFingerprint: current.agenda.fingerprint,
        reportToken: current.reportToken,
        leaseTtlMs: 120_000,
        source: 'mcp',
      },
    });

    const summary = await new MemberWorkSyncPendingReportIntentReplayer(deps).replayTeam('team-a');

    expect(summary).toEqual({ processed: 1, accepted: 1, rejected: 0, superseded: 0 });
    expect(store.pendingIntents.get('intent-1')).toMatchObject({
      status: 'accepted',
      resultCode: 'accepted',
      processedAt: '2026-04-29T00:00:00.000Z',
    });
    expect(store.writes.at(-1)?.state).toBe('still_working');
  });
});
