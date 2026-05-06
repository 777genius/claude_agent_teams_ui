import { describe, expect, it } from 'vitest';

import { decideMemberWorkSyncNudgeActivation } from '@features/member-work-sync/core/application';

import type { MemberWorkSyncStatus, MemberWorkSyncTeamMetrics } from '@features/member-work-sync/contracts';

function status(overrides: Partial<MemberWorkSyncStatus> = {}): MemberWorkSyncStatus {
  return {
    teamName: 'team-a',
    memberName: 'alice',
    state: 'needs_sync',
    agenda: {
      teamName: 'team-a',
      memberName: 'alice',
      generatedAt: '2026-05-06T00:00:00.000Z',
      fingerprint: 'agenda:v1:test',
      items: [
        {
          taskId: 'task-1',
          displayId: '#1',
          subject: 'Do work',
          kind: 'work',
          assignee: 'alice',
          priority: 'normal',
          reason: 'assigned',
          evidence: { status: 'in_progress' },
        },
      ],
      diagnostics: [],
    },
    shadow: {
      reconciledBy: 'queue',
      wouldNudge: true,
      fingerprintChanged: false,
    },
    evaluatedAt: '2026-05-06T00:00:00.000Z',
    diagnostics: [],
    providerId: 'opencode',
    ...overrides,
  };
}

function metrics(overrides: Partial<MemberWorkSyncTeamMetrics> = {}): MemberWorkSyncTeamMetrics {
  return {
    teamName: 'team-a',
    generatedAt: '2026-05-06T00:00:00.000Z',
    memberCount: 1,
    stateCounts: {
      caught_up: 0,
      needs_sync: 1,
      still_working: 0,
      blocked: 0,
      inactive: 0,
      unknown: 0,
    },
    actionableItemCount: 1,
    wouldNudgeCount: 1,
    fingerprintChangeCount: 0,
    reportAcceptedCount: 0,
    reportRejectedCount: 0,
    recentEvents: [],
    phase2Readiness: {
      state: 'collecting_shadow_data',
      reasons: ['insufficient_status_events'],
      thresholds: {
        minObservedMembers: 1,
        minStatusEvents: 20,
        minObservationHours: 1,
        maxWouldNudgesPerMemberHour: 2,
        maxFingerprintChangesPerMemberHour: 1,
        maxReportRejectionRate: 0.2,
      },
      rates: {
        observationHours: 0,
        statusEventCount: 1,
        wouldNudgesPerMemberHour: 1,
        fingerprintChangesPerMemberHour: 0,
        reportRejectionRate: 0,
      },
      diagnostics: ['phase2_readiness:insufficient_status_events'],
    },
    ...overrides,
  };
}

describe('MemberWorkSyncNudgeActivationPolicy', () => {
  it('activates OpenCode targeted nudges while shadow data is still collecting', () => {
    expect(
      decideMemberWorkSyncNudgeActivation({
        status: status(),
        metrics: metrics(),
      })
    ).toEqual({ active: true, reason: 'opencode_targeted_shadow_collecting' });
  });

  it('keeps non-OpenCode providers behind phase2 readiness while collecting', () => {
    expect(
      decideMemberWorkSyncNudgeActivation({
        status: status({ providerId: 'anthropic' }),
        metrics: metrics(),
      })
    ).toEqual({ active: false, reason: 'phase2_not_ready' });
  });

  it('does not activate when blocking safety metrics are present', () => {
    expect(
      decideMemberWorkSyncNudgeActivation({
        status: status(),
        metrics: metrics({
          phase2Readiness: {
            ...metrics().phase2Readiness,
            reasons: ['insufficient_status_events', 'would_nudge_rate_high'],
          },
        }),
      })
    ).toEqual({ active: false, reason: 'blocking_metrics' });
  });

  it('keeps existing shadow_ready behavior for all providers', () => {
    expect(
      decideMemberWorkSyncNudgeActivation({
        status: status({ providerId: 'codex' }),
        metrics: metrics({
          phase2Readiness: {
            ...metrics().phase2Readiness,
            state: 'shadow_ready',
            reasons: [],
          },
        }),
      })
    ).toEqual({ active: true, reason: 'shadow_ready' });
  });
});
