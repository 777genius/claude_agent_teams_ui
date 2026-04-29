import { describe, expect, it, vi } from 'vitest';

import { TeamRuntimeTurnSettledTargetResolver } from '@features/member-work-sync/main/adapters/output/TeamRuntimeTurnSettledTargetResolver';
import type { TeamConfig } from '@shared/types';

describe('TeamRuntimeTurnSettledTargetResolver', () => {
  it('resolves a Claude Stop transcript path to an active Anthropic teammate', async () => {
    const resolver = new TeamRuntimeTurnSettledTargetResolver({
      teamSource: {
        listTeams: vi.fn(async () => [{ teamName: 'team-a', displayName: 'team-a' } as never]),
        getConfig: vi.fn(async () => ({
          name: 'team-a',
          members: [{ name: 'Alice', providerId: 'anthropic' }],
        }) satisfies TeamConfig),
      },
      membersMetaStore: { getMembers: vi.fn(async () => []) } as never,
      memberLogsFinder: {
        listAttributedMemberFiles: vi.fn(async () => [
          {
            memberName: 'Alice',
            sessionId: 'ses-1',
            filePath: '/tmp/ses-1.jsonl',
            mtimeMs: 1,
          },
        ]),
      },
    });

    await expect(
      resolver.resolve({
        schemaVersion: 1,
        provider: 'claude',
        hookEventName: 'Stop',
        sourceId: 'source-1',
        payloadHash: 'hash',
        recordedAt: '2026-04-29T12:00:00.000Z',
        sessionId: 'ses-1',
        transcriptPath: '/tmp/ses-1.jsonl',
      })
    ).resolves.toEqual({ ok: true, teamName: 'team-a', memberName: 'alice' });
  });

  it('rejects matches for removed or non-Anthropic teammates', async () => {
    const resolver = new TeamRuntimeTurnSettledTargetResolver({
      teamSource: {
        listTeams: vi.fn(async () => [{ teamName: 'team-a', displayName: 'team-a' } as never]),
        getConfig: vi.fn(async () => ({
          name: 'team-a',
          members: [{ name: 'bob', providerId: 'opencode' }],
        }) satisfies TeamConfig),
      },
      membersMetaStore: { getMembers: vi.fn(async () => []) } as never,
      memberLogsFinder: {
        listAttributedMemberFiles: vi.fn(async () => [
          {
            memberName: 'bob',
            sessionId: 'ses-1',
            filePath: '/tmp/ses-1.jsonl',
            mtimeMs: 1,
          },
        ]),
      },
    });

    await expect(
      resolver.resolve({
        schemaVersion: 1,
        provider: 'claude',
        hookEventName: 'Stop',
        sourceId: 'source-1',
        payloadHash: 'hash',
        recordedAt: '2026-04-29T12:00:00.000Z',
        sessionId: 'ses-1',
      })
    ).resolves.toEqual({ ok: false, reason: 'provider_mismatch' });
  });
});
