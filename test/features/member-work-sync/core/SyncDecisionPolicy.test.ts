import { describe, expect, it } from 'vitest';

import { decideMemberWorkSyncStatus } from '@features/member-work-sync/core/domain';

import type { MemberWorkSyncAgenda, MemberWorkSyncReport } from '@features/member-work-sync/contracts';

describe('decideMemberWorkSyncStatus', () => {
  it('returns caught_up when canonical filtering leaves no actionable work', () => {
    const agenda: MemberWorkSyncAgenda = {
      teamName: 'forge-labs',
      memberName: 'jack',
      generatedAt: '2026-05-06T19:06:07.257Z',
      fingerprint: 'agenda-empty',
      items: [],
      diagnostics: [],
    };
    const staleReport: MemberWorkSyncReport = {
      teamName: 'forge-labs',
      memberName: 'jack',
      state: 'still_working',
      agendaFingerprint: 'stale-owned-in-progress-task',
      reportedAt: '2026-05-06T19:00:26.089Z',
      accepted: true,
    };

    const decision = decideMemberWorkSyncStatus({
      agenda,
      latestAcceptedReport: staleReport,
      nowIso: '2026-05-06T19:06:07.257Z',
    });

    expect(decision.state).toBe('caught_up');
    expect(decision.acceptedReport).toBeUndefined();
    expect(decision.diagnostics).toContain('agenda_empty');
  });
});
