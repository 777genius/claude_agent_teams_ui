import { describe, expect, it, vi } from 'vitest';

import { TeamTaskAgendaSource } from '@features/member-work-sync/main/adapters/output/TeamTaskAgendaSource';

describe('TeamTaskAgendaSource', () => {
  it('applies kanban approved overlay before building member work agenda', async () => {
    const source = new TeamTaskAgendaSource({
      configReader: {
        getConfig: vi.fn(async () => ({
          members: [{ name: 'jack', agentType: 'developer' }],
        })),
      },
      taskReader: {
        getTasks: vi.fn(async () => [
          {
            id: 'task-approved',
            displayId: '#6d4db591',
            subject: 'Approved through kanban',
            status: 'in_progress',
            owner: 'jack',
            reviewState: 'none',
          },
        ]),
      },
      kanbanManager: {
        getState: vi.fn(async () => ({
          teamName: 'forge-labs',
          reviewers: [],
          tasks: {
            'task-approved': {
              column: 'approved',
              movedAt: '2026-05-06T19:06:07.257Z',
            },
          },
        })),
      },
      membersMetaStore: {
        getMembers: vi.fn(async () => []),
      },
      hash: {
        sha256Hex: vi.fn((value: string) => `h${value.length}`),
      },
      clock: {
        now: () => new Date('2026-05-06T19:06:07.257Z'),
      },
    } as never);

    const result = await source.loadAgenda({
      teamName: 'forge-labs',
      memberName: 'jack',
    });

    expect(result.agenda.items).toEqual([]);
  });
});
