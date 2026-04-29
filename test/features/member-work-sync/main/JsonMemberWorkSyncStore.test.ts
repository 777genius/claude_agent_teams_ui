import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonMemberWorkSyncStore } from '@features/member-work-sync/main/infrastructure/JsonMemberWorkSyncStore';
import { MemberWorkSyncStorePaths } from '@features/member-work-sync/main/infrastructure/MemberWorkSyncStorePaths';
import type {
  MemberWorkSyncNudgePayload,
  MemberWorkSyncStatus,
} from '@features/member-work-sync/contracts';

function makeStatus(overrides: Partial<MemberWorkSyncStatus>): MemberWorkSyncStatus {
  return {
    teamName: 'team-a',
    memberName: 'bob',
    state: 'needs_sync',
    agenda: {
      teamName: 'team-a',
      memberName: 'bob',
      generatedAt: '2026-04-29T00:00:00.000Z',
      fingerprint: 'agenda:v1:abc',
      items: [
        {
          taskId: 'task-1',
          displayId: '11111111',
          subject: 'Ship UI',
          kind: 'work',
          assignee: 'bob',
          priority: 'normal',
          reason: 'owned_pending_task',
          evidence: { status: 'pending', owner: 'bob' },
        },
      ],
      diagnostics: [],
    },
    shadow: {
      reconciledBy: 'queue',
      wouldNudge: true,
      fingerprintChanged: false,
    },
    evaluatedAt: '2026-04-29T00:00:00.000Z',
    diagnostics: [],
    ...overrides,
  };
}

function makeNudgePayload(overrides: Partial<MemberWorkSyncNudgePayload> = {}): MemberWorkSyncNudgePayload {
  return {
    from: 'system',
    to: 'bob',
    messageKind: 'member_work_sync_nudge',
    source: 'member-work-sync',
    actionMode: 'do',
    text: 'Work sync check: continue the current task or report a blocker.',
    taskRefs: [{ teamName: 'team-a', taskId: 'task-1', displayId: '11111111' }],
    ...overrides,
  };
}

describe('JsonMemberWorkSyncStore', () => {
  let root: string;
  let store: JsonMemberWorkSyncStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'member-work-sync-store-'));
    store = new JsonMemberWorkSyncStore(new MemberWorkSyncStorePaths(root));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('quarantines invalid status JSON and returns empty state', async () => {
    const statusPath = join(root, 'team-a', '.member-work-sync', 'status.json');
    await mkdir(join(root, 'team-a', '.member-work-sync'), { recursive: true });
    await writeFile(statusPath, '{bad json', 'utf8');

    await expect(store.read({ teamName: 'team-a', memberName: 'bob' })).resolves.toBeNull();

    const teamDir = join(root, 'team-a', '.member-work-sync');
    const entries = await readdir(teamDir);
    expect(entries.some((entry) => entry.startsWith('status.json.invalid.'))).toBe(true);
  });

  it('deduplicates pending report intents and marks them processed', async () => {
    const request = {
      teamName: 'team-a',
      memberName: 'bob',
      state: 'still_working' as const,
      agendaFingerprint: 'agenda:v1:abc',
      reportToken: 'wrs:v1.test',
      taskIds: ['task-2', 'task-1', 'task-1'],
      source: 'mcp' as const,
    };

    await store.appendPendingReport(request, 'control_api_unavailable');
    await store.appendPendingReport({ ...request, taskIds: ['task-1', 'task-2'] }, 'duplicate');

    const pending = await store.listPendingReports('team-a');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      teamName: 'team-a',
      memberName: 'bob',
      reason: 'control_api_unavailable',
      status: 'pending',
    });

    await store.markPendingReportProcessed('team-a', pending[0].id, {
      status: 'accepted',
      resultCode: 'accepted',
      processedAt: '2026-04-29T00:00:00.000Z',
    });

    expect(await store.listPendingReports('team-a')).toEqual([]);
    const file = JSON.parse(
      await readFile(join(root, 'team-a', '.member-work-sync', 'pending-reports.json'), 'utf8')
    );
    expect(file.intents[pending[0].id]).toMatchObject({
      status: 'accepted',
      resultCode: 'accepted',
    });
  });

  it('records bounded shadow metrics from status writes', async () => {
    await store.write(makeStatus({}));
    await store.write(
      makeStatus({
        agenda: {
          teamName: 'team-a',
          memberName: 'bob',
          generatedAt: '2026-04-29T00:01:00.000Z',
          fingerprint: 'agenda:v1:def',
          items: [],
          diagnostics: [],
        },
        state: 'caught_up',
        shadow: {
          reconciledBy: 'request',
          wouldNudge: false,
          fingerprintChanged: true,
          previousFingerprint: 'agenda:v1:abc',
        },
        evaluatedAt: '2026-04-29T00:01:00.000Z',
      })
    );

    const metrics = await store.readTeamMetrics('team-a');
    expect(metrics).toMatchObject({
      teamName: 'team-a',
      memberCount: 1,
      actionableItemCount: 0,
      wouldNudgeCount: 1,
      fingerprintChangeCount: 1,
    });
    expect(metrics.stateCounts.caught_up).toBe(1);
    expect(metrics.recentEvents.map((event) => event.kind)).toEqual([
      'status_evaluated',
      'would_nudge',
      'status_evaluated',
      'fingerprint_changed',
    ]);
    expect(metrics.phase2Readiness).toMatchObject({
      state: 'collecting_shadow_data',
      reasons: expect.arrayContaining([
        'insufficient_status_events',
        'insufficient_observation_window',
      ]),
    });
  });

  it('deduplicates outbox items by id and rejects payload hash conflicts', async () => {
    const input = {
      id: 'member-work-sync:team-a:bob:agenda:v1:abc',
      teamName: 'team-a',
      memberName: 'bob',
      agendaFingerprint: 'agenda:v1:abc',
      payloadHash: 'hash-a',
      payload: makeNudgePayload(),
      nowIso: '2026-04-29T00:00:00.000Z',
    };

    await expect(store.ensurePending(input)).resolves.toMatchObject({
      ok: true,
      outcome: 'created',
      item: { status: 'pending', attemptGeneration: 0 },
    });
    await expect(store.ensurePending(input)).resolves.toMatchObject({
      ok: true,
      outcome: 'existing',
    });
    await expect(store.ensurePending({ ...input, payloadHash: 'hash-b' })).resolves.toMatchObject({
      ok: false,
      outcome: 'payload_conflict',
      existingPayloadHash: 'hash-a',
      requestedPayloadHash: 'hash-b',
    });
  });

  it('claims due outbox items and fences terminal updates by attempt generation', async () => {
    const input = {
      id: 'member-work-sync:team-a:bob:agenda:v1:abc',
      teamName: 'team-a',
      memberName: 'bob',
      agendaFingerprint: 'agenda:v1:abc',
      payloadHash: 'hash-a',
      payload: makeNudgePayload(),
      nowIso: '2026-04-29T00:00:00.000Z',
    };
    await store.ensurePending(input);

    const claimed = await store.claimDue({
      teamName: 'team-a',
      claimedBy: 'dispatcher-a',
      nowIso: '2026-04-29T00:01:00.000Z',
      limit: 5,
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      id: input.id,
      status: 'claimed',
      attemptGeneration: 1,
      claimedBy: 'dispatcher-a',
    });

    await store.markDelivered({
      teamName: 'team-a',
      id: input.id,
      attemptGeneration: 0,
      deliveredMessageId: 'wrong-generation',
      nowIso: '2026-04-29T00:02:00.000Z',
    });
    await expect(
      store.ensurePending({
        ...input,
        nowIso: '2026-04-29T00:03:00.000Z',
      })
    ).resolves.toMatchObject({
      ok: true,
      item: { status: 'pending', attemptGeneration: 1 },
    });

    const claimedAgain = await store.claimDue({
      teamName: 'team-a',
      claimedBy: 'dispatcher-a',
      nowIso: '2026-04-29T00:04:00.000Z',
      limit: 1,
    });
    await store.markDelivered({
      teamName: 'team-a',
      id: input.id,
      attemptGeneration: claimedAgain[0].attemptGeneration,
      deliveredMessageId: 'message-1',
      nowIso: '2026-04-29T00:05:00.000Z',
    });

    const file = JSON.parse(
      await readFile(join(root, 'team-a', '.member-work-sync', 'outbox.json'), 'utf8')
    );
    expect(file.items[input.id]).toMatchObject({
      status: 'delivered',
      deliveredMessageId: 'message-1',
      attemptGeneration: 2,
    });
  });
});
