import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HmacMemberWorkSyncReportTokenAdapter } from '@features/member-work-sync/main/infrastructure/HmacMemberWorkSyncReportTokenAdapter';
import { MemberWorkSyncStorePaths } from '@features/member-work-sync/main/infrastructure/MemberWorkSyncStorePaths';

describe('HmacMemberWorkSyncReportTokenAdapter', () => {
  let root: string;
  let paths: MemberWorkSyncStorePaths;
  let adapter: HmacMemberWorkSyncReportTokenAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'member-work-sync-token-'));
    paths = new MemberWorkSyncStorePaths(root);
    adapter = new HmacMemberWorkSyncReportTokenAdapter(paths);
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

  it('recovers from a corrupt token secret file', async () => {
    await mkdir(paths.getTeamDir('team-a'), { recursive: true });
    await writeFile(paths.getReportTokenSecretPath('team-a'), '{broken', 'utf8');

    const issued = await adapter.create({
      teamName: 'team-a',
      memberName: 'bob',
      agendaFingerprint: 'agenda:v1:abc',
      issuedAt: '2026-04-29T00:00:00.000Z',
    });

    const secretFile = JSON.parse(await readFile(paths.getReportTokenSecretPath('team-a'), 'utf8'));
    expect(secretFile.schemaVersion).toBe(1);
    expect(typeof secretFile.secret).toBe('string');
    await expect(
      adapter.verify({
        token: issued.token,
        teamName: 'team-a',
        memberName: 'bob',
        agendaFingerprint: 'agenda:v1:abc',
        nowIso: '2026-04-29T00:01:00.000Z',
      })
    ).resolves.toEqual({ ok: true });
  });

  it('does not cache a failed token secret load forever', async () => {
    const secretPath = paths.getReportTokenSecretPath('team-a');
    await mkdir(secretPath, { recursive: true });

    await expect(
      adapter.create({
        teamName: 'team-a',
        memberName: 'bob',
        agendaFingerprint: 'agenda:v1:abc',
        issuedAt: '2026-04-29T00:00:00.000Z',
      })
    ).rejects.toBeTruthy();

    await rm(secretPath, { recursive: true, force: true });
    await expect(
      adapter.create({
        teamName: 'team-a',
        memberName: 'bob',
        agendaFingerprint: 'agenda:v1:abc',
        issuedAt: '2026-04-29T00:00:00.000Z',
      })
    ).resolves.toMatchObject({
      expiresAt: '2026-04-29T00:15:00.000Z',
    });
  });
});
