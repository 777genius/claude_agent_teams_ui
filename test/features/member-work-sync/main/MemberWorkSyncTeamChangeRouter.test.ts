import { describe, expect, it, vi } from 'vitest';

import { MemberWorkSyncTeamChangeRouter } from '@features/member-work-sync/main/adapters/input/MemberWorkSyncTeamChangeRouter';

function createRouter(activeMembers: string[] = ['alice', 'bob']) {
  const queue = {
    enqueue: vi.fn(),
    dropTeam: vi.fn(),
  };
  const router = new MemberWorkSyncTeamChangeRouter(
    {
      loadActiveMemberNames: async () => activeMembers,
    },
    queue as never
  );
  return { queue, router };
}

describe('MemberWorkSyncTeamChangeRouter', () => {
  it('routes task and config events to all active members', async () => {
    const { queue, router } = createRouter();

    router.noteTeamChange({ type: 'task', teamName: 'team-a', detail: 'task-1.json' });
    await Promise.resolve();

    expect(queue.enqueue).toHaveBeenCalledWith({
      teamName: 'team-a',
      memberName: 'alice',
      triggerReason: 'task_changed',
      runAfterMs: undefined,
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      teamName: 'team-a',
      memberName: 'bob',
      triggerReason: 'task_changed',
      runAfterMs: undefined,
    });
  });

  it('routes inbox and tool-finish events to the addressed member only', () => {
    const { queue, router } = createRouter();

    router.noteTeamChange({ type: 'inbox', teamName: 'team-a', detail: 'inboxes/bob.json' });
    router.noteTeamChange({
      type: 'tool-activity',
      teamName: 'team-a',
      detail: JSON.stringify({ action: 'finish', memberName: 'alice', toolUseId: 'tool-1' }),
    });

    expect(queue.enqueue).toHaveBeenCalledWith({
      teamName: 'team-a',
      memberName: 'bob',
      triggerReason: 'inbox_changed',
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      teamName: 'team-a',
      memberName: 'alice',
      triggerReason: 'tool_finished',
    });
  });

  it('drops queued work when the team goes offline', () => {
    const { queue, router } = createRouter();

    router.noteTeamChange({ type: 'lead-activity', teamName: 'team-a', detail: 'offline' });

    expect(queue.dropTeam).toHaveBeenCalledWith('team-a');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
