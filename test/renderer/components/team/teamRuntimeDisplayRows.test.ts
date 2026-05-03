import { describe, expect, it } from 'vitest';

import { buildTeamRuntimeDisplayRows } from '@renderer/components/team/teamRuntimeDisplayRows';

import type {
  MemberSpawnStatusEntry,
  TeamAgentRuntimeEntry,
  TeamAgentRuntimeSnapshot,
} from '@shared/types';

const members = [{ name: 'alice' }, { name: 'bob' }];

function createRuntimeEntry(overrides: Partial<TeamAgentRuntimeEntry> = {}): TeamAgentRuntimeEntry {
  return {
    memberName: 'alice',
    alive: true,
    restartable: true,
    updatedAt: '2026-05-03T10:00:00.000Z',
    ...overrides,
  };
}

function createRuntimeSnapshot(
  membersByName: Record<string, TeamAgentRuntimeEntry>
): TeamAgentRuntimeSnapshot {
  return {
    teamName: 'my-team',
    updatedAt: '2026-05-03T10:00:00.000Z',
    runId: 'run-1',
    members: membersByName,
  };
}

function createSpawnStatus(overrides: Partial<MemberSpawnStatusEntry> = {}): MemberSpawnStatusEntry {
  return {
    status: 'spawning',
    launchState: 'starting',
    updatedAt: '2026-05-03T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildTeamRuntimeDisplayRows', () => {
  it('maps alive runtime entries to running display rows', () => {
    const rows = buildTeamRuntimeDisplayRows({
      members,
      runtimeSnapshot: createRuntimeSnapshot({
        alice: createRuntimeEntry({ runtimeModel: 'claude-sonnet-4.5', runtimePid: 1234 }),
      }),
    });

    expect(rows[0]).toMatchObject({
      memberName: 'alice',
      state: 'running',
      source: 'runtime',
      runtimeModel: 'claude-sonnet-4.5',
      pidLabel: 'runtime pid 1234',
      actionsAllowed: false,
    });
    expect(rows[1]).toMatchObject({
      memberName: 'bob',
      state: 'unknown',
      actionsAllowed: false,
    });
  });

  it('does not treat historical bootstrap as running when runtime is not alive', () => {
    const rows = buildTeamRuntimeDisplayRows({
      members: [{ name: 'alice' }],
      runtimeSnapshot: createRuntimeSnapshot({
        alice: createRuntimeEntry({
          alive: false,
          historicalBootstrapConfirmed: true,
          runtimeDiagnostic: 'Runtime heartbeat is stale',
        }),
      }),
      spawnStatuses: {
        alice: createSpawnStatus({
          status: 'online',
          launchState: 'confirmed_alive',
          bootstrapConfirmed: true,
        }),
      },
    });

    expect(rows[0]).toMatchObject({
      memberName: 'alice',
      state: 'stopped',
      source: 'mixed',
      stateReason: 'Runtime heartbeat is stale',
      actionsAllowed: false,
    });
  });

  it('maps a non-alive runtime with error diagnostics to degraded', () => {
    const rows = buildTeamRuntimeDisplayRows({
      members: [{ name: 'alice' }],
      runtimeSnapshot: createRuntimeSnapshot({
        alice: createRuntimeEntry({
          alive: false,
          runtimeDiagnostic: 'Runtime process crashed',
          runtimeDiagnosticSeverity: 'error',
        }),
      }),
    });

    expect(rows[0]).toMatchObject({
      memberName: 'alice',
      state: 'degraded',
      stateReason: 'Runtime process crashed',
      actionsAllowed: false,
    });
  });

  it('degrades mixed rows when runtime is alive but spawn evidence has failed', () => {
    const rows = buildTeamRuntimeDisplayRows({
      members: [{ name: 'alice' }],
      runtimeSnapshot: createRuntimeSnapshot({
        alice: createRuntimeEntry({
          alive: true,
          runtimeDiagnostic: 'Runtime heartbeat is alive',
        }),
      }),
      spawnStatuses: {
        alice: createSpawnStatus({
          status: 'error',
          launchState: 'failed_to_start',
          hardFailure: true,
          hardFailureReason: 'Bootstrap command failed',
        }),
      },
    });

    expect(rows[0]).toMatchObject({
      memberName: 'alice',
      state: 'degraded',
      source: 'mixed',
      stateReason: 'Bootstrap command failed',
      actionsAllowed: false,
    });
  });

  it('uses explicit spawn status handling without promoting unknown statuses to running', () => {
    const rows = buildTeamRuntimeDisplayRows({
      members: [{ name: 'alice' }, { name: 'bob' }, { name: 'carol' }],
      spawnStatuses: {
        alice: createSpawnStatus({ status: 'spawning' }),
        bob: createSpawnStatus({
          status: 'online',
          launchState: 'confirmed_alive',
          runtimeAlive: true,
        }),
        carol: createSpawnStatus({ status: 'surprising-new-status' as never }),
      },
    });

    expect(rows.map((row) => [row.memberName, row.state])).toEqual([
      ['alice', 'starting'],
      ['bob', 'running'],
      ['carol', 'unknown'],
    ]);
  });

  it('chooses the latest runtime entry when multiple lanes map to one member', () => {
    const rows = buildTeamRuntimeDisplayRows({
      members: [{ name: 'alice' }],
      runtimeSnapshot: createRuntimeSnapshot({
        'alice-primary': createRuntimeEntry({
          memberName: 'alice',
          alive: false,
          laneKind: 'primary',
          updatedAt: '2026-05-03T10:00:00.000Z',
        }),
        'alice-secondary': createRuntimeEntry({
          memberName: 'alice',
          alive: true,
          laneKind: 'secondary',
          updatedAt: '2026-05-03T10:01:00.000Z',
        }),
      }),
    });

    expect(rows[0]).toMatchObject({
      memberName: 'alice',
      state: 'running',
      laneKind: 'secondary',
      actionsAllowed: false,
    });
  });
});
