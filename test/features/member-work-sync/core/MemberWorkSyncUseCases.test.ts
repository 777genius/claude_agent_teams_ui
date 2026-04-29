import { describe, expect, it } from 'vitest';

import {
  MemberWorkSyncDiagnosticsReader,
  MemberWorkSyncNudgeDispatcher,
  MemberWorkSyncPendingReportIntentReplayer,
  MemberWorkSyncReconciler,
  MemberWorkSyncReporter,
  type MemberWorkSyncAgendaSourceResult,
  type MemberWorkSyncInboxNudgePort,
  type MemberWorkSyncOutboxStorePort,
  type MemberWorkSyncStatusStorePort,
  type MemberWorkSyncUseCaseDeps,
} from '@features/member-work-sync/core/application';
import type {
  MemberWorkSyncActionableWorkItem,
  MemberWorkSyncOutboxEnsureInput,
  MemberWorkSyncOutboxItem,
  MemberWorkSyncOutboxMarkDeliveredInput,
  MemberWorkSyncOutboxMarkFailedInput,
  MemberWorkSyncOutboxMarkSupersededInput,
  MemberWorkSyncPhase2ReadinessState,
  MemberWorkSyncReportIntent,
  MemberWorkSyncReportRequest,
  MemberWorkSyncStatus,
  MemberWorkSyncTeamMetrics,
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
  phase2ReadinessState: MemberWorkSyncPhase2ReadinessState = 'collecting_shadow_data';

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

  async readTeamMetrics(teamName: string): Promise<MemberWorkSyncTeamMetrics> {
    return {
      teamName,
      generatedAt: '2026-04-29T00:00:00.000Z',
      memberCount: 1,
      stateCounts: {
        caught_up: 0,
        needs_sync: 1,
        still_working: 0,
        blocked: 0,
        inactive: 0,
        unknown: 0,
      },
      actionableItemCount: this.writes.at(-1)?.agenda.items.length ?? 0,
      wouldNudgeCount: 1,
      fingerprintChangeCount: 0,
      reportAcceptedCount: 0,
      reportRejectedCount: 0,
      recentEvents: [],
      phase2Readiness: {
        state: this.phase2ReadinessState,
        reasons: [],
        thresholds: {
          minObservedMembers: 1,
          minStatusEvents: 20,
          minObservationHours: 1,
          maxWouldNudgesPerMemberHour: 2,
          maxFingerprintChangesPerMemberHour: 1,
          maxReportRejectionRate: 0.2,
        },
        rates: {
          observationHours: 2,
          statusEventCount: 30,
          wouldNudgesPerMemberHour: 0.5,
          fingerprintChangesPerMemberHour: 0,
          reportRejectionRate: 0,
        },
        diagnostics: [],
      },
    };
  }
}

class InMemoryOutboxStore implements MemberWorkSyncOutboxStorePort {
  readonly ensures: MemberWorkSyncOutboxEnsureInput[] = [];
  readonly items = new Map<string, MemberWorkSyncOutboxItem>();

  async ensurePending(input: MemberWorkSyncOutboxEnsureInput) {
    this.ensures.push(input);
    const current = this.items.get(input.id);
    if (current) {
      if (current.status === 'superseded') {
        const revived = {
          ...current,
          status: 'pending' as const,
          updatedAt: input.nowIso,
        };
        delete revived.lastError;
        delete revived.claimedBy;
        delete revived.claimedAt;
        this.items.set(input.id, revived);
        return { ok: true as const, outcome: 'existing' as const, item: revived };
      }
      return { ok: true as const, outcome: 'existing' as const, item: current };
    }
    const item: MemberWorkSyncOutboxItem = {
      ...input,
      status: 'pending',
      attemptGeneration: 0,
      createdAt: input.nowIso,
      updatedAt: input.nowIso,
    };
    this.items.set(input.id, item);
    return { ok: true as const, outcome: 'created' as const, item };
  }

  async claimDue(): Promise<MemberWorkSyncOutboxItem[]> {
    const due = [...this.items.values()].filter((item) => item.status === 'pending');
    for (const item of due) {
      this.items.set(item.id, {
        ...item,
        status: 'claimed',
        attemptGeneration: item.attemptGeneration + 1,
      });
    }
    return due.map((item) => this.items.get(item.id) as MemberWorkSyncOutboxItem);
  }

  async markDelivered(input: MemberWorkSyncOutboxMarkDeliveredInput): Promise<void> {
    const current = this.items.get(input.id);
    if (current?.attemptGeneration === input.attemptGeneration) {
      this.items.set(input.id, {
        ...current,
        status: 'delivered',
        deliveredMessageId: input.deliveredMessageId,
        updatedAt: input.nowIso,
      });
    }
  }

  async markSuperseded(input: MemberWorkSyncOutboxMarkSupersededInput): Promise<void> {
    const current = this.items.get(input.id);
    if (current) {
      this.items.set(input.id, { ...current, status: 'superseded', lastError: input.reason });
    }
  }

  async markFailed(input: MemberWorkSyncOutboxMarkFailedInput): Promise<void> {
    const current = this.items.get(input.id);
    if (current?.attemptGeneration === input.attemptGeneration) {
      this.items.set(input.id, {
        ...current,
        status: input.retryable ? 'failed_retryable' : 'failed_terminal',
        lastError: input.error,
        ...(input.nextAttemptAt ? { nextAttemptAt: input.nextAttemptAt } : {}),
        updatedAt: input.nowIso,
      });
    }
  }

  async countRecentDelivered(input: {
    memberName: string;
    sinceIso: string;
  }): Promise<number> {
    return [...this.items.values()].filter(
      (item) =>
        item.status === 'delivered' &&
        item.memberName === input.memberName &&
        item.updatedAt >= input.sinceIso
    ).length;
  }
}

class InMemoryInboxNudge implements MemberWorkSyncInboxNudgePort {
  readonly inserted: Array<Parameters<MemberWorkSyncInboxNudgePort['insertIfAbsent']>[0]> = [];
  fail = false;

  async insertIfAbsent(input: Parameters<MemberWorkSyncInboxNudgePort['insertIfAbsent']>[0]) {
    if (this.fail) {
      throw new Error('inbox unavailable');
    }
    this.inserted.push(input);
    return { inserted: true, messageId: input.messageId };
  }
}

function createDeps(options?: {
  items?: MemberWorkSyncActionableWorkItem[];
  activeMemberNames?: string[];
  inactive?: boolean;
  teamActive?: boolean;
  providerId?: 'opencode' | 'codex';
  outboxStore?: MemberWorkSyncOutboxStorePort;
  inboxNudge?: MemberWorkSyncInboxNudgePort;
  busySignal?: MemberWorkSyncUseCaseDeps['busySignal'];
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
    ...(options?.outboxStore ? { outboxStore: options.outboxStore } : {}),
    ...(options?.inboxNudge ? { inboxNudge: options.inboxNudge } : {}),
    ...(options?.busySignal ? { busySignal: options.busySignal } : {}),
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

  it('does not create outbox nudges until shadow readiness is green', async () => {
    const outbox = new InMemoryOutboxStore();
    const { deps } = createDeps({ outboxStore: outbox });

    await new MemberWorkSyncReconciler(deps).execute(
      {
        teamName: 'team-a',
        memberName: 'bob',
      },
      { reconciledBy: 'queue', triggerReasons: ['task_changed'] }
    );

    expect(outbox.ensures).toEqual([]);
  });

  it('does not create outbox nudges from read-only diagnostics requests', async () => {
    const outbox = new InMemoryOutboxStore();
    const { deps, store } = createDeps({ outboxStore: outbox });
    store.phase2ReadinessState = 'shadow_ready';

    await new MemberWorkSyncDiagnosticsReader(deps).execute({
      teamName: 'team-a',
      memberName: 'bob',
    });

    expect(outbox.ensures).toEqual([]);
  });

  it('creates one idempotent outbox nudge intent when Phase 2 readiness is green', async () => {
    const outbox = new InMemoryOutboxStore();
    const { deps, store } = createDeps({ outboxStore: outbox });
    store.phase2ReadinessState = 'shadow_ready';

    const status = await new MemberWorkSyncReconciler(deps).execute(
      {
        teamName: 'team-a',
        memberName: 'bob',
      },
      { reconciledBy: 'queue', triggerReasons: ['task_changed'] }
    );

    expect(outbox.ensures).toHaveLength(1);
    expect(outbox.ensures[0]).toMatchObject({
      id: `member-work-sync:team-a:bob:${status.agenda.fingerprint}`,
      teamName: 'team-a',
      memberName: 'bob',
      agendaFingerprint: status.agenda.fingerprint,
      payload: {
        from: 'system',
        to: 'bob',
        messageKind: 'member_work_sync_nudge',
        source: 'member-work-sync',
        actionMode: 'do',
        taskRefs: [{ teamName: 'team-a', taskId: 'task-1', displayId: '11111111' }],
      },
    });
  });

  it('dispatches due nudges only after revalidating current status and readiness', async () => {
    const outbox = new InMemoryOutboxStore();
    const inbox = new InMemoryInboxNudge();
    const { deps, store } = createDeps({ outboxStore: outbox, inboxNudge: inbox });
    store.phase2ReadinessState = 'shadow_ready';

    const status = await new MemberWorkSyncReconciler(deps).execute(
      {
        teamName: 'team-a',
        memberName: 'bob',
      },
      { reconciledBy: 'queue', triggerReasons: ['task_changed'] }
    );
    const summary = await new MemberWorkSyncNudgeDispatcher(deps).dispatchDue({
      teamNames: ['team-a'],
      claimedBy: 'test-dispatcher',
    });

    expect(summary).toMatchObject({ claimed: 1, delivered: 1, superseded: 0 });
    expect(inbox.inserted).toHaveLength(1);
    expect(inbox.inserted[0]).toMatchObject({
      teamName: 'team-a',
      memberName: 'bob',
      messageId: `member-work-sync:team-a:bob:${status.agenda.fingerprint}`,
    });
    expect(outbox.items.get(`member-work-sync:team-a:bob:${status.agenda.fingerprint}`)).toMatchObject({
      status: 'delivered',
      deliveredMessageId: `member-work-sync:team-a:bob:${status.agenda.fingerprint}`,
    });
  });

  it('does not dispatch stale outbox items after the member reports still working', async () => {
    const outbox = new InMemoryOutboxStore();
    const inbox = new InMemoryInboxNudge();
    const { clock, deps, store } = createDeps({ outboxStore: outbox, inboxNudge: inbox });
    store.phase2ReadinessState = 'shadow_ready';

    const reconciler = new MemberWorkSyncReconciler(deps);
    const reporter = new MemberWorkSyncReporter(deps);
    const current = await reconciler.execute(
      { teamName: 'team-a', memberName: 'bob' },
      { reconciledBy: 'queue', triggerReasons: ['task_changed'] }
    );
    await reporter.execute({
      teamName: 'team-a',
      memberName: 'bob',
      state: 'still_working',
      agendaFingerprint: current.agenda.fingerprint,
      reportToken: current.reportToken,
      leaseTtlMs: 120_000,
      source: 'test',
    });

    const summary = await new MemberWorkSyncNudgeDispatcher(deps).dispatchDue({
      teamNames: ['team-a'],
      claimedBy: 'test-dispatcher',
    });

    expect(summary).toMatchObject({ claimed: 1, delivered: 0, superseded: 1 });
    expect(inbox.inserted).toEqual([]);
    expect(outbox.items.get(`member-work-sync:team-a:bob:${current.agenda.fingerprint}`)).toMatchObject({
      status: 'superseded',
      lastError: 'status_no_longer_matches_outbox',
    });

    clock.set('2026-04-29T00:03:00.000Z');
    const expired = await reconciler.execute(
      { teamName: 'team-a', memberName: 'bob' },
      { reconciledBy: 'queue', triggerReasons: ['task_changed'] }
    );

    expect(expired.state).toBe('needs_sync');
    const revived = outbox.items.get(`member-work-sync:team-a:bob:${current.agenda.fingerprint}`);
    expect(revived).toMatchObject({ status: 'pending' });
    expect(revived).not.toHaveProperty('lastError');
  });

  it('rate-limits delivered nudges per member per hour', async () => {
    const outbox = new InMemoryOutboxStore();
    const inbox = new InMemoryInboxNudge();
    const { deps, store } = createDeps({ outboxStore: outbox, inboxNudge: inbox });
    store.phase2ReadinessState = 'shadow_ready';

    const current = await new MemberWorkSyncReconciler(deps).execute(
      {
        teamName: 'team-a',
        memberName: 'bob',
      },
      { reconciledBy: 'queue', triggerReasons: ['task_changed'] }
    );
    const firstId = `member-work-sync:team-a:bob:${current.agenda.fingerprint}:old-1`;
    const secondId = `member-work-sync:team-a:bob:${current.agenda.fingerprint}:old-2`;
    const baseItem = outbox.items.get(`member-work-sync:team-a:bob:${current.agenda.fingerprint}`);
    expect(baseItem).toBeDefined();
    for (const id of [firstId, secondId]) {
      outbox.items.set(id, {
        ...(baseItem as NonNullable<typeof baseItem>),
        id,
        status: 'delivered',
        deliveredMessageId: id,
        updatedAt: '2026-04-29T00:00:00.000Z',
      });
    }

    const summary = await new MemberWorkSyncNudgeDispatcher(deps).dispatchDue({
      teamNames: ['team-a'],
      claimedBy: 'test-dispatcher',
    });

    expect(summary).toMatchObject({ claimed: 1, delivered: 0, retryable: 1 });
    expect(inbox.inserted).toEqual([]);
    expect(outbox.items.get(`member-work-sync:team-a:bob:${current.agenda.fingerprint}`)).toMatchObject({
      status: 'failed_retryable',
      lastError: 'member_nudge_rate_limited',
      nextAttemptAt: '2026-04-29T01:00:00.000Z',
    });
  });

  it('defers nudge dispatch while the member has active or recent tool activity', async () => {
    const outbox = new InMemoryOutboxStore();
    const inbox = new InMemoryInboxNudge();
    const { deps, store } = createDeps({
      outboxStore: outbox,
      inboxNudge: inbox,
      busySignal: {
        isBusy: async () => ({
          busy: true,
          reason: 'active_tool_activity',
          retryAfterIso: '2026-04-29T00:02:00.000Z',
        }),
      },
    });
    store.phase2ReadinessState = 'shadow_ready';

    const current = await new MemberWorkSyncReconciler(deps).execute(
      {
        teamName: 'team-a',
        memberName: 'bob',
      },
      { reconciledBy: 'queue', triggerReasons: ['tool_finished'] }
    );
    const summary = await new MemberWorkSyncNudgeDispatcher(deps).dispatchDue({
      teamNames: ['team-a'],
      claimedBy: 'test-dispatcher',
    });

    expect(summary).toMatchObject({ claimed: 1, delivered: 0, retryable: 1 });
    expect(inbox.inserted).toEqual([]);
    expect(outbox.items.get(`member-work-sync:team-a:bob:${current.agenda.fingerprint}`)).toMatchObject({
      status: 'failed_retryable',
      lastError: 'member_busy:active_tool_activity',
      nextAttemptAt: '2026-04-29T00:02:00.000Z',
    });
  });

  it('uses bounded retry backoff when inbox delivery fails', async () => {
    const outbox = new InMemoryOutboxStore();
    const inbox = new InMemoryInboxNudge();
    inbox.fail = true;
    const { deps, store } = createDeps({ outboxStore: outbox, inboxNudge: inbox });
    store.phase2ReadinessState = 'shadow_ready';

    const current = await new MemberWorkSyncReconciler(deps).execute(
      {
        teamName: 'team-a',
        memberName: 'bob',
      },
      { reconciledBy: 'queue', triggerReasons: ['task_changed'] }
    );
    const summary = await new MemberWorkSyncNudgeDispatcher(deps).dispatchDue({
      teamNames: ['team-a'],
      claimedBy: 'test-dispatcher',
    });

    const item = outbox.items.get(`member-work-sync:team-a:bob:${current.agenda.fingerprint}`);
    expect(summary).toMatchObject({ claimed: 1, delivered: 0, retryable: 1 });
    expect(item).toMatchObject({
      status: 'failed_retryable',
      lastError: 'Error: inbox unavailable',
    });
    expect(Date.parse(item?.nextAttemptAt ?? '')).toBeGreaterThan(
      Date.parse('2026-04-29T00:09:59.000Z')
    );
    expect(Date.parse(item?.nextAttemptAt ?? '')).toBeLessThanOrEqual(
      Date.parse('2026-04-29T00:14:00.000Z')
    );
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
