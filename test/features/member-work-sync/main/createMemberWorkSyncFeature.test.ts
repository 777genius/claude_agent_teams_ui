import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildMemberWorkSyncRuntimeTurnSettledEnvironment,
  createMemberWorkSyncFeature,
} from '@features/member-work-sync/main';
import { buildMemberWorkSyncOutboxEnsureInput } from '@features/member-work-sync/core/domain';
import { JsonMemberWorkSyncStore } from '@features/member-work-sync/main/infrastructure/JsonMemberWorkSyncStore';
import { MemberWorkSyncStorePaths } from '@features/member-work-sync/main/infrastructure/MemberWorkSyncStorePaths';
import { NodeHashAdapter } from '@features/member-work-sync/main/infrastructure/NodeHashAdapter';
import { RUNTIME_TURN_SETTLED_SPOOL_ROOT_ENV } from '@features/member-work-sync/main/infrastructure/runtimeTurnSettledEnvironment';
import { getTeamsBasePath, setClaudeBasePathOverride } from '@main/utils/pathDecoder';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'member-work-sync-feature-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  setClaudeBasePathOverride(null);
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function seedShadowReadyMetrics(input: {
  teamsBasePath: string;
  teamName: string;
  memberName: string;
}): Promise<void> {
  const metricsPath = path.join(
    input.teamsBasePath,
    input.teamName,
    '.member-work-sync',
    'indexes',
    'metrics.json'
  );
  await fs.promises.mkdir(path.dirname(metricsPath), { recursive: true });
  await fs.promises.writeFile(
    metricsPath,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        members: {
          [input.memberName]: {
            memberName: input.memberName,
            state: 'caught_up',
            agendaFingerprint: 'agenda:v1:seed',
            actionableCount: 0,
            evaluatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        recentEvents: Array.from({ length: 20 }, (_, index) => ({
          id: `seed-status-${index}`,
          teamName: input.teamName,
          memberName: input.memberName,
          kind: 'status_evaluated',
          state: 'caught_up',
          agendaFingerprint: `agenda:v1:seed-${index}`,
          recordedAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
          actionableCount: 0,
        })),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

async function waitForAssertion(assertion: () => Promise<void> | void): Promise<void> {
  const deadline = Date.now() + 1_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (lastError) {
    throw lastError;
  }
  await assertion();
}

describe('createMemberWorkSyncFeature composition', () => {
  it('dispatches a due nudge through the real outbox and inbox by default', async () => {
    const claudeRoot = makeTempRoot();
    setClaudeBasePathOverride(claudeRoot);
    const teamsBasePath = getTeamsBasePath();
    const teamName = 'team-a';
    const memberName = 'bob';
    const feature = createMemberWorkSyncFeature({
      teamsBasePath,
      configReader: {
        getConfig: vi.fn(async () => ({
          name: teamName,
          members: [{ name: memberName }],
        })),
      } as never,
      taskReader: {
        getTasks: vi.fn(async () => [
          {
            id: 'task-1',
            displayId: '11111111',
            subject: 'Ship sync',
            status: 'pending',
            owner: memberName,
          },
        ]),
      } as never,
      kanbanManager: {
        getState: vi.fn(async () => ({
          teamName,
          reviewers: [],
          tasks: {},
        })),
      } as never,
      membersMetaStore: {
        getMembers: vi.fn(async () => []),
      } as never,
    });

    try {
      await seedShadowReadyMetrics({ teamsBasePath, teamName, memberName });
      const status = await feature.refreshStatus({ teamName, memberName });
      expect(status).toMatchObject({
        state: 'needs_sync',
        shadow: { wouldNudge: true },
      });
      await expect(feature.getMetrics({ teamName })).resolves.toMatchObject({
        phase2Readiness: { state: 'shadow_ready' },
      });

      const outboxInput = buildMemberWorkSyncOutboxEnsureInput({
        status,
        hash: new NodeHashAdapter(),
        nowIso: status.evaluatedAt,
      });
      expect(outboxInput).not.toBeNull();
      const store = new JsonMemberWorkSyncStore(new MemberWorkSyncStorePaths(teamsBasePath));
      await expect(store.ensurePending(outboxInput!)).resolves.toMatchObject({
        ok: true,
        outcome: 'created',
      });

      await expect(feature.dispatchDueNudges([teamName])).resolves.toEqual({
        claimed: 1,
        delivered: 1,
        superseded: 0,
        retryable: 0,
        terminal: 0,
      });
      await expect(
        fs.promises.readFile(path.join(teamsBasePath, teamName, 'inboxes', `${memberName}.json`), {
          encoding: 'utf8',
        })
      ).resolves.toContain(outboxInput!.id);
    } finally {
      await feature.dispose();
    }
  });

  it('plans and dispatches due nudges after queued reconcile by default', async () => {
    const claudeRoot = makeTempRoot();
    setClaudeBasePathOverride(claudeRoot);
    const teamsBasePath = getTeamsBasePath();
    const teamName = 'team-a';
    const memberName = 'bob';
    const feature = createMemberWorkSyncFeature({
      teamsBasePath,
      configReader: {
        getConfig: vi.fn(async () => ({
          name: teamName,
          members: [{ name: memberName }],
        })),
      } as never,
      taskReader: {
        getTasks: vi.fn(async () => [
          {
            id: 'task-1',
            displayId: '11111111',
            subject: 'Ship sync',
            status: 'pending',
            owner: memberName,
          },
        ]),
      } as never,
      kanbanManager: {
        getState: vi.fn(async () => ({
          teamName,
          reviewers: [],
          tasks: {},
        })),
      } as never,
      membersMetaStore: {
        getMembers: vi.fn(async () => []),
      } as never,
      queueQuietWindowMs: 1,
    });

    try {
      await seedShadowReadyMetrics({ teamsBasePath, teamName, memberName });
      feature.noteTeamChange({
        type: 'task',
        teamName,
        taskId: 'task-1',
      } as never);

      await waitForAssertion(async () => {
        expect(feature.getQueueDiagnostics()).toMatchObject({ reconciled: 1 });
        const inbox = await fs.promises.readFile(
          path.join(teamsBasePath, teamName, 'inboxes', `${memberName}.json`),
          'utf8'
        );
        expect(inbox).toContain('member_work_sync_nudge');
        expect(inbox).toContain(`member-work-sync:${teamName}:${memberName}:agenda:v1:`);
      });
    } finally {
      await feature.dispose();
    }
  });

  it('uses snapshot config reads for startup roster materialization', async () => {
    const getConfig = vi.fn(async () => ({ members: [] }));
    const getConfigSnapshot = vi.fn(async () => ({
      members: [{ name: 'alice' }],
    }));
    const feature = createMemberWorkSyncFeature({
      teamsBasePath: makeTempRoot(),
      configReader: {
        getConfig,
        getConfigSnapshot,
      } as never,
      taskReader: {} as never,
      kanbanManager: {} as never,
      membersMetaStore: {
        getMembers: vi.fn(async () => []),
      } as never,
    });

    try {
      await feature.enqueueStartupScan(['my-team']);
      expect(getConfigSnapshot).toHaveBeenCalledWith('my-team');
      expect(getConfig).not.toHaveBeenCalled();
    } finally {
      await feature.dispose();
    }
  });

  it('builds Claude Stop hook settings with nudges active by default', async () => {
    const root = makeTempRoot();
    const feature = createMemberWorkSyncFeature({
      teamsBasePath: root,
      configReader: {} as never,
      taskReader: {} as never,
      kanbanManager: {} as never,
      membersMetaStore: {} as never,
    });

    try {
      const settings = await feature.buildRuntimeTurnSettledHookSettings({ provider: 'claude' });
      expect(settings).toMatchObject({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: expect.stringContaining('agent-teams:member-work-sync-turn-settled:v1'),
                },
              ],
            },
          ],
        },
      });
      await expect(
        fs.promises.stat(
          path.join(root, '.member-work-sync/runtime-hooks/bin/turn-settled-hook-v1.sh')
        )
      ).resolves.toMatchObject({ mode: expect.any(Number) });
    } finally {
      await feature.dispose();
    }
  });

  it('builds Codex turn-settled environment with nudges active by default', async () => {
    const root = makeTempRoot();
    const feature = createMemberWorkSyncFeature({
      teamsBasePath: root,
      configReader: {} as never,
      taskReader: {} as never,
      kanbanManager: {} as never,
      membersMetaStore: {} as never,
    });

    try {
      const env = await feature.buildRuntimeTurnSettledEnvironment({ provider: 'codex' });
      expect(env).toEqual({
        [RUNTIME_TURN_SETTLED_SPOOL_ROOT_ENV]: path.join(
          root,
          '.member-work-sync/runtime-hooks'
        ),
      });
      await expect(
        fs.promises.stat(path.join(root, '.member-work-sync/runtime-hooks/incoming'))
      ).resolves.toMatchObject({ mode: expect.any(Number) });
    } finally {
      await feature.dispose();
    }
  });

  it('builds OpenCode turn-settled environment with nudges active by default', async () => {
    const root = makeTempRoot();
    const feature = createMemberWorkSyncFeature({
      teamsBasePath: root,
      configReader: {} as never,
      taskReader: {} as never,
      kanbanManager: {} as never,
      membersMetaStore: {} as never,
    });

    try {
      const env = await feature.buildRuntimeTurnSettledEnvironment({ provider: 'opencode' });
      expect(env).toEqual({
        [RUNTIME_TURN_SETTLED_SPOOL_ROOT_ENV]: path.join(
          root,
          '.member-work-sync/runtime-hooks'
        ),
      });
      await expect(
        fs.promises.stat(path.join(root, '.member-work-sync/runtime-hooks/incoming'))
      ).resolves.toMatchObject({ mode: expect.any(Number) });
    } finally {
      await feature.dispose();
    }
  });

  it('builds OpenCode bridge environment before feature facade initialization', async () => {
    const root = makeTempRoot();

    const env = await buildMemberWorkSyncRuntimeTurnSettledEnvironment({
      teamsBasePath: root,
      provider: 'opencode',
    });

    expect(env).toEqual({
      [RUNTIME_TURN_SETTLED_SPOOL_ROOT_ENV]: path.join(
        root,
        '.member-work-sync/runtime-hooks'
      ),
    });
    await expect(
      fs.promises.stat(path.join(root, '.member-work-sync/runtime-hooks/incoming'))
    ).resolves.toMatchObject({ mode: expect.any(Number) });
  });
});
