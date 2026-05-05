import { describe, expect, it } from 'vitest';

import { buildActionableWorkAgenda } from '@features/member-work-sync/core/domain';

const hash = (value: string) => `h${value.length}`;

describe('buildActionableWorkAgenda', () => {
  it('includes owned pending and in-progress work but excludes completed tasks', () => {
    const agenda = buildActionableWorkAgenda({
      teamName: 'team-a',
      memberName: 'bob',
      generatedAt: '2026-04-29T00:00:00.000Z',
      members: [{ name: 'bob' }],
      tasks: [
        {
          id: 'task-1',
          displayId: '#11111111',
          subject: 'Pending',
          status: 'pending',
          owner: 'bob',
        },
        {
          id: 'task-2',
          displayId: '#22222222',
          subject: 'In progress',
          status: 'in_progress',
          owner: 'Bob',
        },
        {
          id: 'task-3',
          displayId: '#33333333',
          subject: 'Done',
          status: 'completed',
          owner: 'bob',
        },
      ],
      hash,
    });

    expect(agenda.items.map((item) => [item.taskId, item.kind, item.reason])).toEqual([
      ['task-1', 'work', 'owned_pending_task'],
      ['task-2', 'work', 'owned_in_progress_task'],
    ]);
  });

  it('assigns active review work to the current-cycle reviewer only', () => {
    const agenda = buildActionableWorkAgenda({
      teamName: 'team-a',
      memberName: 'alice',
      generatedAt: '2026-04-29T00:00:00.000Z',
      members: [{ name: 'alice' }, { name: 'bob' }],
      tasks: [
        {
          id: 'task-1',
          subject: 'Review me',
          status: 'in_progress',
          owner: 'bob',
          reviewState: 'review',
          historyEvents: [
            {
              id: 'evt-1',
              type: 'review_requested',
              timestamp: '2026-04-29T00:00:00.000Z',
              reviewer: 'alice',
            },
          ],
        },
      ],
      hash,
    });

    expect(agenda.items).toHaveLength(1);
    expect(agenda.items[0]).toMatchObject({
      taskId: 'task-1',
      kind: 'review',
      assignee: 'alice',
      evidence: { reviewer: 'alice' },
    });
  });

  it('does not resurrect a stale reviewer after review was approved', () => {
    const agenda = buildActionableWorkAgenda({
      teamName: 'team-a',
      memberName: 'alice',
      generatedAt: '2026-04-29T00:00:00.000Z',
      members: [{ name: 'alice' }, { name: 'bob' }],
      tasks: [
        {
          id: 'task-1',
          subject: 'Old review',
          status: 'in_progress',
          owner: 'bob',
          reviewState: 'review',
          historyEvents: [
            {
              id: 'evt-1',
              type: 'review_requested',
              timestamp: '2026-04-29T00:00:00.000Z',
              reviewer: 'alice',
            },
            {
              id: 'evt-2',
              type: 'review_approved',
              timestamp: '2026-04-29T00:01:00.000Z',
              actor: 'alice',
            },
          ],
        },
      ],
      hash,
    });

    expect(agenda.items).toEqual([]);
  });

  it('prefers current kanban reviewer over older review history while task remains in review', () => {
    const agenda = buildActionableWorkAgenda({
      teamName: 'team-a',
      memberName: 'carol',
      generatedAt: '2026-04-29T00:00:00.000Z',
      members: [{ name: 'alice' }, { name: 'bob' }, { name: 'carol' }],
      kanbanReviewersByTaskId: { 'task-1': 'carol' },
      tasks: [
        {
          id: 'task-1',
          subject: 'Review me',
          status: 'in_progress',
          owner: 'bob',
          reviewState: 'review',
          historyEvents: [
            {
              id: 'evt-1',
              type: 'review_started',
              timestamp: '2026-04-29T00:00:00.000Z',
              actor: 'alice',
            },
          ],
        },
      ],
      hash,
    });

    expect(agenda.items).toHaveLength(1);
    expect(agenda.items[0]).toMatchObject({
      taskId: 'task-1',
      kind: 'review',
      assignee: 'carol',
      evidence: { reviewer: 'carol' },
    });
  });

  it('does not nudge owners while work is waiting on user or unfinished dependencies', () => {
    const agenda = buildActionableWorkAgenda({
      teamName: 'team-a',
      memberName: 'bob',
      generatedAt: '2026-04-29T00:00:00.000Z',
      members: [{ name: 'bob' }, { name: 'team-lead', agentType: 'team-lead' }],
      tasks: [
        {
          id: 'task-1',
          subject: 'Need user',
          status: 'in_progress',
          owner: 'bob',
          needsClarification: 'user',
        },
        {
          id: 'task-3',
          displayId: '#33333333',
          subject: 'Dependency',
          status: 'in_progress',
          owner: 'alice',
        },
        {
          id: 'task-2',
          subject: 'Waiting dependency',
          status: 'in_progress',
          owner: 'bob',
          blockedBy: ['#33333333'],
        },
      ],
      hash,
    });

    expect(agenda.items).toEqual([]);
  });

  it('does not project display-id dependencies as broken when the dependency exists', () => {
    const agenda = buildActionableWorkAgenda({
      teamName: 'team-a',
      memberName: 'team-lead',
      generatedAt: '2026-04-29T00:00:00.000Z',
      members: [{ name: 'bob' }, { name: 'team-lead', agentType: 'team-lead' }],
      tasks: [
        {
          id: 'task-dep',
          displayId: '#33333333',
          subject: 'Existing dependency',
          status: 'in_progress',
          owner: 'alice',
        },
        {
          id: 'task-2',
          subject: 'Waiting dependency',
          status: 'in_progress',
          owner: 'bob',
          blockedBy: ['33333333'],
        },
      ],
      hash,
    });

    expect(agenda.items).toEqual([]);
  });

  it('projects lead-owned oversight for lead clarification and broken dependencies', () => {
    const agenda = buildActionableWorkAgenda({
      teamName: 'team-a',
      memberName: 'team-lead',
      generatedAt: '2026-04-29T00:00:00.000Z',
      members: [{ name: 'bob' }, { name: 'team-lead', agentType: 'team-lead' }],
      tasks: [
        {
          id: 'task-1',
          subject: 'Need lead',
          status: 'in_progress',
          owner: 'bob',
          needsClarification: 'lead',
        },
        {
          id: 'task-2',
          subject: 'Broken dependency',
          status: 'in_progress',
          owner: 'bob',
          blockedBy: ['missing-task'],
        },
      ],
      hash,
    });

    expect(agenda.items.map((item) => [item.taskId, item.kind, item.reason])).toEqual([
      ['task-1', 'clarification', 'task_needs_lead_clarification'],
      ['task-2', 'blocked_dependency', 'task_has_broken_dependency'],
    ]);
  });

  it('treats needsFix as owner work', () => {
    const agenda = buildActionableWorkAgenda({
      teamName: 'team-a',
      memberName: 'bob',
      generatedAt: '2026-04-29T00:00:00.000Z',
      members: [{ name: 'bob' }],
      tasks: [
        {
          id: 'task-1',
          subject: 'Fix review',
          status: 'in_progress',
          owner: 'bob',
          reviewState: 'needsFix',
        },
      ],
      hash,
    });

    expect(agenda.items.map((item) => [item.taskId, item.kind, item.reason])).toEqual([
      ['task-1', 'work', 'review_changes_requested'],
    ]);
  });

  it('keeps fingerprint stable across generatedAt changes and changes it on owner change', () => {
    const base = {
      teamName: 'team-a',
      memberName: 'bob',
      members: [{ name: 'bob' }, { name: 'alice' }],
      hash,
    };
    const first = buildActionableWorkAgenda({
      ...base,
      generatedAt: '2026-04-29T00:00:00.000Z',
      tasks: [{ id: 'task-1', subject: 'Work', status: 'pending', owner: 'bob' }],
    });
    const second = buildActionableWorkAgenda({
      ...base,
      generatedAt: '2026-04-29T00:05:00.000Z',
      tasks: [{ id: 'task-1', subject: 'Work', status: 'pending', owner: 'bob' }],
    });
    const third = buildActionableWorkAgenda({
      ...base,
      generatedAt: '2026-04-29T00:05:00.000Z',
      tasks: [{ id: 'task-1', subject: 'Work', status: 'pending', owner: 'alice' }],
    });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe(third.fingerprint);
  });
});
