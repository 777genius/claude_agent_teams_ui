import { describe, expect, it } from 'vitest';

import {
  buildActionableWorkAgenda,
  validateMemberWorkSyncReport,
} from '@features/member-work-sync/core/domain';

const nowIso = '2026-04-29T00:00:00.000Z';
const hash = (value: string) => `h${value.length}`;

function agendaWithWork() {
  return buildActionableWorkAgenda({
    teamName: 'team-a',
    memberName: 'bob',
    generatedAt: nowIso,
    members: [{ name: 'bob' }],
    tasks: [{ id: 'task-1', subject: 'Work', status: 'pending', owner: 'bob' }],
    hash,
  });
}

describe('validateMemberWorkSyncReport', () => {
  it('accepts still_working for the current agenda fingerprint', () => {
    const agenda = agendaWithWork();
    const result = validateMemberWorkSyncReport({
      request: {
        teamName: 'team-a',
        memberName: 'bob',
        state: 'still_working',
        agendaFingerprint: agenda.fingerprint,
      },
      agenda,
      nowIso,
      activeMemberNames: ['bob'],
    });

    expect(result.ok).toBe(true);
    expect(result.expiresAt).toBe('2026-04-29T00:15:00.000Z');
  });

  it('rejects caught_up while actionable work remains', () => {
    const agenda = agendaWithWork();
    const result = validateMemberWorkSyncReport({
      request: {
        teamName: 'team-a',
        memberName: 'bob',
        state: 'caught_up',
        agendaFingerprint: agenda.fingerprint,
      },
      agenda,
      nowIso,
      activeMemberNames: ['bob'],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'caught_up_rejected_actionable_items_exist',
    });
  });

  it('rejects blocked without current blocker evidence', () => {
    const agenda = agendaWithWork();
    const result = validateMemberWorkSyncReport({
      request: {
        teamName: 'team-a',
        memberName: 'bob',
        state: 'blocked',
        agendaFingerprint: agenda.fingerprint,
      },
      agenda,
      nowIso,
      activeMemberNames: ['bob'],
    });

    expect(result).toMatchObject({ ok: false, code: 'blocked_without_evidence' });
  });

  it('rejects stale fingerprints and foreign task ids', () => {
    const agenda = agendaWithWork();
    const stale = validateMemberWorkSyncReport({
      request: {
        teamName: 'team-a',
        memberName: 'bob',
        state: 'still_working',
        agendaFingerprint: 'agenda:v1:old',
      },
      agenda,
      nowIso,
      activeMemberNames: ['bob'],
    });
    const foreign = validateMemberWorkSyncReport({
      request: {
        teamName: 'team-a',
        memberName: 'bob',
        state: 'still_working',
        agendaFingerprint: agenda.fingerprint,
        taskIds: ['other-task'],
      },
      agenda,
      nowIso,
      activeMemberNames: ['bob'],
    });

    expect(stale.code).toBe('stale_fingerprint');
    expect(foreign.code).toBe('foreign_task_id');
  });

  it('rejects reserved and inactive member identities', () => {
    const agenda = agendaWithWork();
    const reserved = validateMemberWorkSyncReport({
      request: {
        teamName: 'team-a',
        memberName: 'user',
        state: 'still_working',
        agendaFingerprint: agenda.fingerprint,
      },
      agenda,
      nowIso,
      activeMemberNames: ['bob'],
    });
    const inactive = validateMemberWorkSyncReport({
      request: {
        teamName: 'team-a',
        memberName: 'bob',
        state: 'still_working',
        agendaFingerprint: agenda.fingerprint,
      },
      agenda,
      nowIso,
      activeMemberNames: [],
    });

    expect(reserved.code).toBe('reserved_or_invalid_member');
    expect(inactive.code).toBe('member_inactive');
  });
});
