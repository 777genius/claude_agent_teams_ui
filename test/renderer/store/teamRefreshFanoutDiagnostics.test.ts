import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetTeamRefreshFanoutDiagnosticsForTests,
  buildTeamRefreshFanoutCountKey,
  getTeamRefreshFanoutSnapshotForTests,
  MAX_TEAM_REFRESH_DIAGNOSTIC_RECENT_NOTES,
  MAX_TEAM_REFRESH_DIAGNOSTIC_TEAMS,
  noteTeamRefreshFanout,
  type TeamRefreshFanoutSnapshot,
} from '../../../src/renderer/store/teamRefreshFanoutDiagnostics';

function snapshotFor(teamName: string): TeamRefreshFanoutSnapshot {
  const snapshot = getTeamRefreshFanoutSnapshotForTests(teamName);
  expect(snapshot).not.toBeNull();
  return snapshot as TeamRefreshFanoutSnapshot;
}

describe('teamRefreshFanoutDiagnostics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetTeamRefreshFanoutDiagnosticsForTests();
  });

  afterEach(() => {
    __resetTeamRefreshFanoutDiagnosticsForTests();
    vi.useRealTimers();
  });

  it('records scheduled and executed fanout counts separately', () => {
    const scheduled = {
      teamName: 'team-a',
      surface: 'team-change-listener',
      phase: 'scheduled',
      reason: 'event:process',
      operation: 'refreshTeamData',
    } as const;
    const executed = {
      ...scheduled,
      phase: 'executed',
    } as const;

    noteTeamRefreshFanout(scheduled);
    noteTeamRefreshFanout(executed);

    const snapshot = snapshotFor('team-a');
    expect(snapshot.counts[buildTeamRefreshFanoutCountKey(scheduled)]).toBe(1);
    expect(snapshot.counts[buildTeamRefreshFanoutCountKey(executed)]).toBe(1);
  });

  it('records coalesced notes separately from scheduled notes', () => {
    const scheduled = {
      teamName: 'team-a',
      surface: 'team-change-listener',
      phase: 'scheduled',
      reason: 'event:member-spawn',
      operation: 'fetchMemberSpawnStatuses',
    } as const;
    const coalesced = {
      ...scheduled,
      phase: 'coalesced',
    } as const;

    noteTeamRefreshFanout(scheduled);
    noteTeamRefreshFanout(coalesced);
    noteTeamRefreshFanout(coalesced);

    const snapshot = snapshotFor('team-a');
    expect(snapshot.counts[buildTeamRefreshFanoutCountKey(scheduled)]).toBe(1);
    expect(snapshot.counts[buildTeamRefreshFanoutCountKey(coalesced)]).toBe(2);
  });

  it('caps recent notes per team', () => {
    for (let index = 0; index < MAX_TEAM_REFRESH_DIAGNOSTIC_RECENT_NOTES + 5; index += 1) {
      noteTeamRefreshFanout({
        teamName: 'team-a',
        surface: 'team-change-listener',
        phase: 'scheduled',
        reason: `event:${index}`,
        operation: 'refreshTeamData',
      });
    }

    const snapshot = snapshotFor('team-a');
    expect(snapshot.recent).toHaveLength(MAX_TEAM_REFRESH_DIAGNOSTIC_RECENT_NOTES);
    expect(snapshot.recent[0]?.reason).toBe('event:5');
  });

  it('caps team buckets by evicting the oldest bucket', () => {
    for (let index = 0; index < MAX_TEAM_REFRESH_DIAGNOSTIC_TEAMS + 1; index += 1) {
      noteTeamRefreshFanout({
        teamName: `team-${index}`,
        surface: 'team-change-listener',
        phase: 'scheduled',
        reason: 'event:process',
        operation: 'refreshTeamData',
      });
    }

    expect(getTeamRefreshFanoutSnapshotForTests('team-0')).toBeNull();
    expect(
      getTeamRefreshFanoutSnapshotForTests(`team-${MAX_TEAM_REFRESH_DIAGNOSTIC_TEAMS}`)
    ).not.toBeNull();
  });

  it('reset clears all diagnostic state', () => {
    noteTeamRefreshFanout({
      teamName: 'team-a',
      surface: 'team-change-listener',
      phase: 'scheduled',
      reason: 'event:process',
      operation: 'refreshTeamData',
    });

    __resetTeamRefreshFanoutDiagnosticsForTests();

    expect(getTeamRefreshFanoutSnapshotForTests('team-a')).toBeNull();
    expect(getTeamRefreshFanoutSnapshotForTests()).toEqual({});
  });

  it('ignores invalid empty team or reason values', () => {
    noteTeamRefreshFanout({
      teamName: '',
      surface: 'team-change-listener',
      phase: 'scheduled',
      reason: 'event:process',
      operation: 'refreshTeamData',
    });
    noteTeamRefreshFanout({
      teamName: 'team-a',
      surface: 'team-change-listener',
      phase: 'scheduled',
      reason: '',
      operation: 'refreshTeamData',
    });

    expect(getTeamRefreshFanoutSnapshotForTests()).toEqual({});
  });
});
