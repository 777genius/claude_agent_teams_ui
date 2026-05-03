export type TeamRefreshFanoutSurface =
  | 'team-change-listener'
  | 'provisioning-progress'
  | 'pending-reply-fallback'
  | 'manual-refresh';

export type TeamRefreshFanoutPhase = 'scheduled' | 'coalesced' | 'executed' | 'skipped';

export type TeamRefreshFanoutOperation =
  | 'fetchTeams'
  | 'fetchAllTasks'
  | 'refreshTeamData'
  | 'selectTeam'
  | 'fetchTeamMessageHead'
  | 'fetchMemberSpawnStatuses'
  | 'fetchTeamAgentRuntime'
  | 'refreshTaskChangePresence';

export interface TeamRefreshFanoutNote {
  teamName: string;
  surface: TeamRefreshFanoutSurface;
  phase: TeamRefreshFanoutPhase;
  reason: string;
  operation: TeamRefreshFanoutOperation;
  eventType?: string;
  tabId?: string;
  selected?: boolean;
  visible?: boolean;
  activeTab?: boolean;
}

export interface TeamRefreshFanoutRecentNote {
  at: number;
  surface: TeamRefreshFanoutSurface;
  phase: TeamRefreshFanoutPhase;
  reason: string;
  operation: TeamRefreshFanoutOperation;
  eventType?: string;
  tabId?: string;
  selected?: boolean;
  visible?: boolean;
  activeTab?: boolean;
}

export interface TeamRefreshFanoutSnapshot {
  counts: Record<string, number>;
  recent: TeamRefreshFanoutRecentNote[];
  lastAt: number;
}

interface TeamRefreshFanoutBucket {
  counts: Record<string, number>;
  recent: TeamRefreshFanoutRecentNote[];
  lastAt: number;
}

export const MAX_TEAM_REFRESH_DIAGNOSTIC_TEAMS = 100;
export const MAX_TEAM_REFRESH_DIAGNOSTIC_RECENT_NOTES = 50;

const buckets = new Map<string, TeamRefreshFanoutBucket>();

function createEmptyBucket(): TeamRefreshFanoutBucket {
  return {
    counts: {},
    recent: [],
    lastAt: 0,
  };
}

function ensureTeamBucket(teamName: string): TeamRefreshFanoutBucket {
  if (!buckets.has(teamName) && buckets.size >= MAX_TEAM_REFRESH_DIAGNOSTIC_TEAMS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (oldestKey) {
      buckets.delete(oldestKey);
    }
  }

  let bucket = buckets.get(teamName);
  if (!bucket) {
    bucket = createEmptyBucket();
    buckets.set(teamName, bucket);
  }

  return bucket;
}

function cloneBucket(
  bucket: TeamRefreshFanoutBucket | undefined
): TeamRefreshFanoutSnapshot | null {
  if (!bucket) {
    return null;
  }

  return {
    counts: { ...bucket.counts },
    recent: bucket.recent.map((note) => ({ ...note })),
    lastAt: bucket.lastAt,
  };
}

export function buildTeamRefreshFanoutCountKey(note: TeamRefreshFanoutNote): string {
  return `${note.surface}:${note.reason}:${note.operation}:${note.phase}`;
}

export function noteTeamRefreshFanout(note: TeamRefreshFanoutNote): void {
  if (!note.teamName || !note.reason || !note.operation) {
    return;
  }

  const bucket = ensureTeamBucket(note.teamName);
  const key = buildTeamRefreshFanoutCountKey(note);
  const now = Date.now();

  bucket.counts[key] = (bucket.counts[key] ?? 0) + 1;
  bucket.lastAt = now;
  bucket.recent.push({
    at: now,
    surface: note.surface,
    phase: note.phase,
    reason: note.reason,
    operation: note.operation,
    eventType: note.eventType,
    tabId: note.tabId,
    selected: note.selected,
    visible: note.visible,
    activeTab: note.activeTab,
  });

  if (bucket.recent.length > MAX_TEAM_REFRESH_DIAGNOSTIC_RECENT_NOTES) {
    bucket.recent.splice(0, bucket.recent.length - MAX_TEAM_REFRESH_DIAGNOSTIC_RECENT_NOTES);
  }
}

export function getTeamRefreshFanoutSnapshotForTests(
  teamName?: string
): TeamRefreshFanoutSnapshot | Record<string, TeamRefreshFanoutSnapshot> | null {
  if (teamName) {
    return cloneBucket(buckets.get(teamName));
  }

  return Object.fromEntries(
    Array.from(buckets.entries(), ([key, bucket]) => [key, cloneBucket(bucket)])
  ) as Record<string, TeamRefreshFanoutSnapshot>;
}

export function __resetTeamRefreshFanoutDiagnosticsForTests(): void {
  buckets.clear();
}
