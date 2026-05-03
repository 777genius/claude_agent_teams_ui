import { createHash } from 'crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  shouldIgnoreLogSourceWatcherPath,
  TeamLogSourceTracker,
} from '../../../../src/main/services/team/TeamLogSourceTracker';

import type { TeamMemberLogsFinder } from '../../../../src/main/services/team/TeamMemberLogsFinder';
import type { TeamChangeEvent } from '../../../../src/shared/types';

function safeTaskIdSegment(taskId: string): string {
  return `task-id-${createHash('sha256').update(taskId).digest('hex').slice(0, 32)}`;
}

describe('TeamLogSourceTracker', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('emits task-log-change for matching runtime freshness signals without broad log-source-change', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'team-log-source-tracker-'));

    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: tempDir!,
        sessionIds: [],
        watchSessionIds: [],
})),
    } as unknown as TeamMemberLogsFinder;

    const tracker = new TeamLogSourceTracker(logsFinder);
    const emitter = vi.fn<(event: TeamChangeEvent) => void>();
    tracker.setEmitter(emitter);

    await tracker.enableTracking('demo', 'change_presence');
    emitter.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const taskId = '123e4567-e89b-12d3-a456-426614174999';
    const signalDir = path.join(tempDir, '.board-task-log-freshness');
    await mkdir(signalDir, { recursive: true });
    await writeFile(path.join(signalDir, `${encodeURIComponent(taskId)}.json`), '{"ok":true}');

    await vi.waitFor(() => {
      expect(emitter).toHaveBeenCalledWith({
        type: 'task-log-change',
        teamName: 'demo',
        taskId,
      });
    });

    expect(emitter.mock.calls.map(([event]) => event.type)).not.toContain('log-source-change');

    await tracker.disableTracking('demo', 'change_presence');
  });

  it('keeps task-log tracking alive until the last consumer unsubscribes', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'team-log-source-tracker-refcount-'));

    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: tempDir!,
        sessionIds: [],
        watchSessionIds: [],
})),
    } as unknown as TeamMemberLogsFinder;

    const tracker = new TeamLogSourceTracker(logsFinder);
    const emitter = vi.fn<(event: TeamChangeEvent) => void>();
    tracker.setEmitter(emitter);

    await tracker.enableTracking('demo', 'task_log_stream');
    await tracker.enableTracking('demo', 'task_log_stream');
    emitter.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    await tracker.disableTracking('demo', 'task_log_stream');

    const taskId = '223e4567-e89b-12d3-a456-426614174999';
    const signalDir = path.join(tempDir, '.board-task-log-freshness');
    await mkdir(signalDir, { recursive: true });
    await writeFile(path.join(signalDir, `${encodeURIComponent(taskId)}.json`), '{"ok":true}');

    await vi.waitFor(() => {
      expect(emitter).toHaveBeenCalledWith({
        type: 'task-log-change',
        teamName: 'demo',
        taskId,
      });
    });

    emitter.mockClear();
    await tracker.disableTracking('demo', 'task_log_stream');
    await writeFile(path.join(signalDir, `${encodeURIComponent(taskId)}.json`), '{"ok":false}');
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(emitter).not.toHaveBeenCalled();
  });

  it('emits log-source-change for scoped root transcripts', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'team-log-source-tracker-scoped-root-'));
    await writeFile(path.join(tempDir, 'lead-session.jsonl'), '{"seq":1}\n');

    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: tempDir!,
        sessionIds: ['lead-session'],
        watchSessionIds: ['lead-session'],
      })),
    } as unknown as TeamMemberLogsFinder;

    const tracker = new TeamLogSourceTracker(logsFinder);
    const emitter = vi.fn<(event: TeamChangeEvent) => void>();
    tracker.setEmitter(emitter);

    await tracker.enableTracking('demo', 'change_presence');
    emitter.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    await writeFile(path.join(tempDir, 'lead-session.jsonl'), '{"seq":2}\n');

    await vi.waitFor(() => {
      expect(emitter).toHaveBeenCalledWith({
        type: 'log-source-change',
        teamName: 'demo',
      });
    });

    await tracker.disableTracking('demo', 'change_presence');
  });

  it('ignores old unscoped root transcript changes', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'team-log-source-tracker-unscoped-root-'));
    await writeFile(path.join(tempDir, 'lead-session.jsonl'), '{"seq":1}\n');
    await writeFile(path.join(tempDir, 'old-session.jsonl'), '{"seq":1}\n');

    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: tempDir!,
        sessionIds: ['lead-session'],
        watchSessionIds: ['lead-session'],
      })),
    } as unknown as TeamMemberLogsFinder;

    const tracker = new TeamLogSourceTracker(logsFinder);
    const emitter = vi.fn<(event: TeamChangeEvent) => void>();
    tracker.setEmitter(emitter);

    await tracker.enableTracking('demo', 'change_presence');
    emitter.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    await writeFile(path.join(tempDir, 'old-session.jsonl'), '{"seq":2}\n');
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(emitter.mock.calls.map(([event]) => event.type)).not.toContain('log-source-change');

    await tracker.disableTracking('demo', 'change_presence');
  });

  it('emits log-source-change when a scoped root transcript appears', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'team-log-source-tracker-pending-root-'));

    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: tempDir!,
        sessionIds: ['new-runtime'],
        watchSessionIds: ['new-runtime'],
      })),
    } as unknown as TeamMemberLogsFinder;

    const tracker = new TeamLogSourceTracker(logsFinder);
    const emitter = vi.fn<(event: TeamChangeEvent) => void>();
    tracker.setEmitter(emitter);

    await tracker.enableTracking('demo', 'change_presence');
    emitter.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    await writeFile(path.join(tempDir, 'new-runtime.jsonl'), '{"seq":1}\n');

    await vi.waitFor(() => {
      expect(emitter).toHaveBeenCalledWith({
        type: 'log-source-change',
        teamName: 'demo',
      });
    });

    await tracker.disableTracking('demo', 'change_presence');
  });

  it('does not reinitialize when another consumer joins an already tracked team', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'team-log-source-tracker-init-'));

    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: tempDir!,
        sessionIds: [],
        watchSessionIds: [],
})),
    } as unknown as TeamMemberLogsFinder;

    const tracker = new TeamLogSourceTracker(logsFinder);

    await tracker.enableTracking('demo', 'tool_activity');
    await tracker.enableTracking('demo', 'task_log_stream');

    expect(logsFinder.getLiveLogSourceWatchContext).toHaveBeenCalledTimes(1);

    await tracker.disableTracking('demo', 'task_log_stream');
    await tracker.disableTracking('demo', 'tool_activity');
  });

  it('notifies log-source listeners before forwarding the external team change event', () => {
    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: '/tmp/demo',
        sessionIds: [],
        watchSessionIds: [],
})),
    } as unknown as TeamMemberLogsFinder;
    const tracker = new TeamLogSourceTracker(logsFinder);
    const events: string[] = [];
    tracker.onLogSourceChange(() => {
      events.push('listener');
    });
    tracker.setEmitter(() => {
      events.push('emitter');
    });

    (
      tracker as unknown as {
        emitLogSourceChange: (teamName: string) => void;
      }
    ).emitLogSourceChange('demo');

    expect(events).toEqual(['listener', 'emitter']);
  });

  it('supports stall_monitor as an independent tracking consumer', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'team-log-source-tracker-stall-monitor-'));

    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: tempDir!,
        sessionIds: [],
        watchSessionIds: [],
})),
    } as unknown as TeamMemberLogsFinder;

    const tracker = new TeamLogSourceTracker(logsFinder);
    const emitter = vi.fn<(event: TeamChangeEvent) => void>();
    tracker.setEmitter(emitter);

    await tracker.enableTracking('demo', 'stall_monitor');
    emitter.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const taskId = '323e4567-e89b-12d3-a456-426614174999';
    const signalDir = path.join(tempDir, '.board-task-log-freshness');
    await mkdir(signalDir, { recursive: true });
    await writeFile(path.join(signalDir, `${encodeURIComponent(taskId)}.json`), '{"ok":true}');

    await vi.waitFor(() => {
      expect(emitter).toHaveBeenCalledWith({
        type: 'task-log-change',
        teamName: 'demo',
        taskId,
      });
    });

    await tracker.disableTracking('demo', 'stall_monitor');
  });

  it('emits the task id from Windows-safe hashed task-change freshness files', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'team-log-source-tracker-safe-task-'));

    const logsFinder = {
      getLiveLogSourceWatchContext: vi.fn(async () => ({
        projectDir: tempDir!,
        sessionIds: [],
        watchSessionIds: [],
})),
    } as unknown as TeamMemberLogsFinder;

    const tracker = new TeamLogSourceTracker(logsFinder);
    const emitter = vi.fn<(event: TeamChangeEvent) => void>();
    tracker.setEmitter(emitter);

    await tracker.enableTracking('demo', 'change_presence');
    emitter.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const taskId = 'CON';
    const signalDir = path.join(tempDir, '.board-task-change-freshness');
    await mkdir(signalDir, { recursive: true });
    await writeFile(
      path.join(signalDir, `${safeTaskIdSegment(taskId)}.json`),
      JSON.stringify({ taskId, updatedAt: '2026-04-19T12:00:00.000Z' }),
      'utf8'
    );

    await vi.waitFor(() => {
      expect(emitter).toHaveBeenCalledWith({
        type: 'task-log-change',
        teamName: 'demo',
        taskId,
      });
    });
    expect(emitter.mock.calls).not.toContainEqual([
      expect.objectContaining({ type: 'task-log-change', taskId: safeTaskIdSegment(taskId) }),
    ]);

    await tracker.disableTracking('demo', 'change_presence');
  });

  it('ignores internal ledger artifact paths but keeps freshness signals visible', () => {
    const projectDir = '/tmp/demo-project';
    const scopedSessionIds = new Set(['lead-session']);

    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, '.board-task-changes', 'events', 'task.jsonl')
      )
    ).toBe(true);
    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, '.board-task-changes', 'locks', 'task.lock', 'owner.json')
      )
    ).toBe(true);
    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, '.board-task-change-freshness', 'task.json')
      )
    ).toBe(false);
    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, '.board-task-log-freshness', 'task.json'),
        { scopedSessionIds }
      )
    ).toBe(false);
    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, 'lead-session.jsonl'),
        { scopedSessionIds }
      )
    ).toBe(false);
    expect(
      shouldIgnoreLogSourceWatcherPath(projectDir, path.join(projectDir, 'old-session.jsonl'), {
        scopedSessionIds,
      })
    ).toBe(true);
    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, 'pending-session.jsonl'),
        {
          scopedSessionIds,
          pendingRootSessionIds: new Set(['pending-session']),
        }
      )
    ).toBe(false);
    expect(
      shouldIgnoreLogSourceWatcherPath(projectDir, path.join(projectDir, 'lead-session'), {
        scopedSessionIds,
      })
    ).toBe(false);
    expect(
      shouldIgnoreLogSourceWatcherPath(projectDir, path.join(projectDir, 'pending-session'), {
        scopedSessionIds,
        pendingRootSessionIds: new Set(['pending-session']),
      })
    ).toBe(true);
    expect(
      shouldIgnoreLogSourceWatcherPath(projectDir, path.join(projectDir, 'old-session'), {
        scopedSessionIds,
      })
    ).toBe(true);
    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, 'lead-session', 'subagents', 'agent-worker.jsonl'),
        { scopedSessionIds }
      )
    ).toBe(false);
    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, 'lead-session', 'subagents', 'agent-acompact-worker.jsonl'),
        { scopedSessionIds }
      )
    ).toBe(true);
    expect(
      shouldIgnoreLogSourceWatcherPath(
        projectDir,
        path.join(projectDir, 'old-session', 'subagents', 'agent-worker.jsonl'),
        { scopedSessionIds }
      )
    ).toBe(true);
  });
});
