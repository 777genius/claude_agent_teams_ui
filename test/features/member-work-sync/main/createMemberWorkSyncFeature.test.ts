import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MEMBER_WORK_SYNC_NUDGE_SIDE_EFFECTS_ENV,
  createMemberWorkSyncFeature,
  resolveMemberWorkSyncNudgeSideEffectsEnabled,
} from '@features/member-work-sync/main';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'member-work-sync-feature-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('createMemberWorkSyncFeature composition', () => {
  it('keeps nudge side effects opt-in even when shadow readiness becomes green', () => {
    expect(resolveMemberWorkSyncNudgeSideEffectsEnabled({})).toBe(false);
    expect(
      resolveMemberWorkSyncNudgeSideEffectsEnabled({
        [MEMBER_WORK_SYNC_NUDGE_SIDE_EFFECTS_ENV]: 'maybe',
      })
    ).toBe(false);
  });

  it.each(['1', 'true', 'yes', 'on'])(
    'enables nudge side effects only for explicit truthy env value %s',
    (value) => {
      expect(
        resolveMemberWorkSyncNudgeSideEffectsEnabled({
          [MEMBER_WORK_SYNC_NUDGE_SIDE_EFFECTS_ENV]: value,
        })
      ).toBe(true);
    }
  );

  it.each(['0', 'false', 'no', 'off', ''])(
    'keeps nudge side effects disabled for explicit falsy env value %s',
    (value) => {
      expect(
        resolveMemberWorkSyncNudgeSideEffectsEnabled({
          [MEMBER_WORK_SYNC_NUDGE_SIDE_EFFECTS_ENV]: value,
        })
      ).toBe(false);
    }
  );

  it('returns an empty dispatch summary when nudge side effects are disabled', async () => {
    const feature = createMemberWorkSyncFeature({
      teamsBasePath: makeTempRoot(),
      configReader: {} as never,
      taskReader: {} as never,
      kanbanManager: {} as never,
      membersMetaStore: {} as never,
      nudgeSideEffectsEnabled: false,
    });

    try {
      await expect(feature.dispatchDueNudges(['team-a'])).resolves.toEqual({
        claimed: 0,
        delivered: 0,
        superseded: 0,
        retryable: 0,
        terminal: 0,
      });
    } finally {
      await feature.dispose();
    }
  });

  it('builds Claude Stop hook settings without requiring nudge side effects', async () => {
    const root = makeTempRoot();
    const feature = createMemberWorkSyncFeature({
      teamsBasePath: root,
      configReader: {} as never,
      taskReader: {} as never,
      kanbanManager: {} as never,
      membersMetaStore: {} as never,
      nudgeSideEffectsEnabled: false,
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
});
