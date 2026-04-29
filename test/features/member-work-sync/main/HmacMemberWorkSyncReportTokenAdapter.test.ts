import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HmacMemberWorkSyncReportTokenAdapter } from '@features/member-work-sync/main/infrastructure/HmacMemberWorkSyncReportTokenAdapter';
import { MemberWorkSyncStorePaths } from '@features/member-work-sync/main/infrastructure/MemberWorkSyncStorePaths';

describe('HmacMemberWorkSyncReportTokenAdapter', () => {
  let root: string;
  let adapter: HmacMemberWorkSyncReportTokenAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'member-work-sync-token-'));
    adapter = new HmacMemberWorkSyncReportTokenAdapter(new MemberWorkSyncStorePaths(root));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a token bound to team, member, fingerprint, and expiry', async () => {
    const issued = await adapter.create({
      teamName: 'team-a',
      memberName: 'bob',
      agendaFingerprint: 'agenda:v1:abc',
      issuedAt: '2026-04-29T00:00:00.000Z',
    });

    expect(issued.expiresAt).toBe('2026-04-29T00:15:00.000Z');
    await expect(
      adapter.verify({
        token: issued.token,
        teamName: 'team-a',
        memberName: 'bob',
        agendaFingerprint: 'agenda:v1:abc',
        nowIso: '2026-04-29T00:14:59.000Z',
      })
    ).resolves.toEqual({ ok: true });
  });

  it('rejects copied, stale, and expired tokens', async () => {
    const issued = await adapter.create({
      teamName: 'team-a',
      memberName: 'bob',
      agendaFingerprint: 'agenda:v1:abc',
      issuedAt: '2026-04-29T00:00:00.000Z',
    });

    await expect(
      adapter.verify({
        token: issued.token,
        teamName: 'team-a',
        memberName: 'alice',
        agendaFingerprint: 'agenda:v1:abc',
        nowIso: '2026-04-29T00:01:00.000Z',
      })
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(
      adapter.verify({
        token: issued.token,
        teamName: 'team-a',
        memberName: 'bob',
        agendaFingerprint: 'agenda:v1:new',
        nowIso: '2026-04-29T00:01:00.000Z',
      })
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(
      adapter.verify({
        token: issued.token,
        teamName: 'team-a',
        memberName: 'bob',
        agendaFingerprint: 'agenda:v1:abc',
        nowIso: '2026-04-29T00:15:00.000Z',
      })
    ).resolves.toEqual({ ok: false, reason: 'expired' });
  });
});
