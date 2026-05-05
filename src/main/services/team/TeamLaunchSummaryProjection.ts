import { isMixedOpenCodeSideLanePlan, planTeamRuntimeLanes } from '@features/team-runtime-lanes';
import { normalizeOptionalTeamProviderId } from '@shared/utils/teamProvider';

import { shouldIgnoreTerminalBootstrapOnlyPendingSnapshot } from './TeamBootstrapStateReader';
import { hasMixedPersistedLaunchMetadata } from './TeamLaunchStateEvaluator';

import type { PersistedTeamLaunchSnapshot, TeamProviderId, TeamSummary } from '@shared/types';

export const TEAM_LAUNCH_SUMMARY_FILE = 'launch-summary.json';
const STALE_PENDING_SUMMARY_GRACE_MS = 5 * 60 * 1000;

export interface LaunchStateSummary {
  partialLaunchFailure?: true;
  expectedMemberCount?: number;
  confirmedMemberCount?: number;
  missingMembers?: string[];
  skippedMembers?: string[];
  teamLaunchState?: TeamSummary['teamLaunchState'];
  launchUpdatedAt?: string;
  confirmedCount?: number;
  pendingCount?: number;
  failedCount?: number;
  skippedCount?: number;
  runtimeAlivePendingCount?: number;
  shellOnlyPendingCount?: number;
  runtimeProcessPendingCount?: number;
  runtimeCandidatePendingCount?: number;
  noRuntimePendingCount?: number;
  permissionPendingCount?: number;
}

export interface PersistedTeamLaunchSummaryProjection extends LaunchStateSummary {
  version: 1;
  teamName: string;
  updatedAt: string;
  launchPhase?: PersistedTeamLaunchSnapshot['launchPhase'];
  mixedAware?: true;
}

function getPersistedLaunchMemberNames(snapshot: PersistedTeamLaunchSnapshot): string[] {
  return Array.from(new Set([...snapshot.expectedMembers, ...Object.keys(snapshot.members)]));
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toMillis(value: string | undefined | null): number {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value);
}

export function createLaunchStateSummary(
  snapshot: PersistedTeamLaunchSnapshot
): LaunchStateSummary {
  const persistedMemberNames = getPersistedLaunchMemberNames(snapshot);
  const missingMembers = persistedMemberNames.filter((name) => {
    const member = snapshot.members[name];
    return member?.launchState === 'failed_to_start';
  });
  const skippedMembers = persistedMemberNames.filter((name) => {
    const member = snapshot.members[name];
    return member?.launchState === 'skipped_for_launch' || member?.skippedForLaunch === true;
  });

  return {
    ...(snapshot.teamLaunchState === 'partial_failure'
      ? { partialLaunchFailure: true as const }
      : {}),
    ...(persistedMemberNames.length > 0
      ? { expectedMemberCount: persistedMemberNames.length }
      : {}),
    ...(snapshot.summary.confirmedCount > 0
      ? { confirmedMemberCount: snapshot.summary.confirmedCount }
      : {}),
    ...(missingMembers.length > 0 ? { missingMembers } : {}),
    ...(skippedMembers.length > 0 ? { skippedMembers } : {}),
    teamLaunchState: snapshot.teamLaunchState,
    launchUpdatedAt: snapshot.updatedAt,
    confirmedCount: snapshot.summary.confirmedCount,
    pendingCount: snapshot.summary.pendingCount,
    failedCount: snapshot.summary.failedCount,
    skippedCount: snapshot.summary.skippedCount,
    runtimeAlivePendingCount: snapshot.summary.runtimeAlivePendingCount,
    shellOnlyPendingCount: snapshot.summary.shellOnlyPendingCount,
    runtimeProcessPendingCount: snapshot.summary.runtimeProcessPendingCount,
    runtimeCandidatePendingCount: snapshot.summary.runtimeCandidatePendingCount,
    noRuntimePendingCount: snapshot.summary.noRuntimePendingCount,
    permissionPendingCount: snapshot.summary.permissionPendingCount,
  };
}

export function createPersistedLaunchSummaryProjection(
  snapshot: PersistedTeamLaunchSnapshot
): PersistedTeamLaunchSummaryProjection {
  return {
    version: 1,
    teamName: snapshot.teamName,
    updatedAt: snapshot.updatedAt,
    launchPhase: snapshot.launchPhase,
    ...(hasMixedPersistedLaunchMetadata(snapshot) ? { mixedAware: true as const } : {}),
    ...createLaunchStateSummary(snapshot),
  };
}

export function normalizePersistedLaunchSummaryProjection(
  teamName: string,
  value: unknown
): PersistedTeamLaunchSummaryProjection | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return null;
  }
  const updatedAt = normalizeIsoDate(record.updatedAt);
  if (!updatedAt) {
    return null;
  }

  const normalized: PersistedTeamLaunchSummaryProjection = {
    version: 1,
    teamName,
    updatedAt,
    ...(record.mixedAware === true ? { mixedAware: true as const } : {}),
  };
  if (
    record.launchPhase === 'active' ||
    record.launchPhase === 'finished' ||
    record.launchPhase === 'reconciled'
  ) {
    normalized.launchPhase = record.launchPhase;
  }

  if (record.partialLaunchFailure === true) {
    normalized.partialLaunchFailure = true;
  }
  if (typeof record.expectedMemberCount === 'number' && record.expectedMemberCount >= 0) {
    normalized.expectedMemberCount = record.expectedMemberCount;
  }
  if (typeof record.confirmedMemberCount === 'number' && record.confirmedMemberCount >= 0) {
    normalized.confirmedMemberCount = record.confirmedMemberCount;
  }
  if (Array.isArray(record.missingMembers)) {
    const missingMembers = record.missingMembers.filter(
      (member): member is string => typeof member === 'string' && member.trim().length > 0
    );
    if (missingMembers.length > 0) {
      normalized.missingMembers = missingMembers;
    }
  }
  if (Array.isArray(record.skippedMembers)) {
    const skippedMembers = record.skippedMembers.filter(
      (member): member is string => typeof member === 'string' && member.trim().length > 0
    );
    if (skippedMembers.length > 0) {
      normalized.skippedMembers = skippedMembers;
    }
  }
  if (
    record.teamLaunchState === 'partial_failure' ||
    record.teamLaunchState === 'partial_skipped' ||
    record.teamLaunchState === 'partial_pending' ||
    record.teamLaunchState === 'clean_success'
  ) {
    normalized.teamLaunchState = record.teamLaunchState;
  }
  if (typeof record.confirmedCount === 'number' && record.confirmedCount >= 0) {
    normalized.confirmedCount = record.confirmedCount;
  }
  if (typeof record.pendingCount === 'number' && record.pendingCount >= 0) {
    normalized.pendingCount = record.pendingCount;
  }
  if (typeof record.failedCount === 'number' && record.failedCount >= 0) {
    normalized.failedCount = record.failedCount;
  }
  if (typeof record.skippedCount === 'number' && record.skippedCount >= 0) {
    normalized.skippedCount = record.skippedCount;
  }
  if (typeof record.runtimeAlivePendingCount === 'number' && record.runtimeAlivePendingCount >= 0) {
    normalized.runtimeAlivePendingCount = record.runtimeAlivePendingCount;
  }
  if (typeof record.shellOnlyPendingCount === 'number' && record.shellOnlyPendingCount >= 0) {
    normalized.shellOnlyPendingCount = record.shellOnlyPendingCount;
  }
  if (
    typeof record.runtimeProcessPendingCount === 'number' &&
    record.runtimeProcessPendingCount >= 0
  ) {
    normalized.runtimeProcessPendingCount = record.runtimeProcessPendingCount;
  }
  if (
    typeof record.runtimeCandidatePendingCount === 'number' &&
    record.runtimeCandidatePendingCount >= 0
  ) {
    normalized.runtimeCandidatePendingCount = record.runtimeCandidatePendingCount;
  }
  if (typeof record.noRuntimePendingCount === 'number' && record.noRuntimePendingCount >= 0) {
    normalized.noRuntimePendingCount = record.noRuntimePendingCount;
  }
  if (typeof record.permissionPendingCount === 'number' && record.permissionPendingCount >= 0) {
    normalized.permissionPendingCount = record.permissionPendingCount;
  }
  normalized.launchUpdatedAt = updatedAt;
  return normalized;
}

function shouldIgnoreStalePendingSummaryProjection(
  projection: PersistedTeamLaunchSummaryProjection,
  nowMs: number = Date.now()
): boolean {
  if (projection.teamLaunchState !== 'partial_pending') {
    return false;
  }
  if ((projection.permissionPendingCount ?? 0) > 0) {
    return false;
  }

  const updatedAtMs = toMillis(projection.launchUpdatedAt ?? projection.updatedAt);
  return Number.isFinite(updatedAtMs) && nowMs - updatedAtMs >= STALE_PENDING_SUMMARY_GRACE_MS;
}

function shouldIgnoreStalePendingLaunchSnapshotSummary(
  snapshot: PersistedTeamLaunchSnapshot,
  nowMs: number = Date.now()
): boolean {
  if (snapshot.teamLaunchState !== 'partial_pending') {
    return false;
  }
  if ((snapshot.summary.permissionPendingCount ?? 0) > 0) {
    return false;
  }

  const updatedAtMs = toMillis(snapshot.updatedAt);
  return Number.isFinite(updatedAtMs) && nowMs - updatedAtMs >= STALE_PENDING_SUMMARY_GRACE_MS;
}

export function choosePreferredLaunchStateSummary(params: {
  bootstrapSnapshot?: PersistedTeamLaunchSnapshot | null;
  launchSnapshot?: PersistedTeamLaunchSnapshot | null;
  launchSummaryProjection?: PersistedTeamLaunchSummaryProjection | null;
}): LaunchStateSummary | null {
  const launchSnapshot =
    params.launchSnapshot && shouldIgnoreStalePendingLaunchSnapshotSummary(params.launchSnapshot)
      ? null
      : (params.launchSnapshot ?? null);
  if (launchSnapshot) {
    return createLaunchStateSummary(launchSnapshot);
  }

  const bootstrapSnapshot = params.bootstrapSnapshot ?? null;
  const projection =
    params.launchSummaryProjection &&
    shouldIgnoreStalePendingSummaryProjection(params.launchSummaryProjection)
      ? null
      : (params.launchSummaryProjection ?? null);
  if (!bootstrapSnapshot) {
    return projection;
  }
  if (!projection && shouldIgnoreTerminalBootstrapOnlyPendingSnapshot(bootstrapSnapshot)) {
    return null;
  }
  if (!projection) {
    return createLaunchStateSummary(bootstrapSnapshot);
  }

  const bootstrapMixedAware = hasMixedPersistedLaunchMetadata(bootstrapSnapshot);
  const projectionMixedAware = projection.mixedAware === true;
  if (projectionMixedAware !== bootstrapMixedAware) {
    return projectionMixedAware ? projection : createLaunchStateSummary(bootstrapSnapshot);
  }

  const projectionUpdatedAtMs = toMillis(projection.updatedAt);
  const bootstrapUpdatedAtMs = toMillis(bootstrapSnapshot.updatedAt);
  if (!Number.isFinite(bootstrapUpdatedAtMs)) {
    return projection;
  }
  if (!Number.isFinite(projectionUpdatedAtMs)) {
    return createLaunchStateSummary(bootstrapSnapshot);
  }
  return projectionUpdatedAtMs >= bootstrapUpdatedAtMs
    ? projection
    : createLaunchStateSummary(bootstrapSnapshot);
}

export function shouldSuppressLegacyLaunchArtifactHeuristic(params: {
  leadProviderId?: TeamProviderId;
  members: readonly { name: string; providerId?: TeamProviderId; removedAt?: unknown }[];
}): boolean {
  const liveMembers = params.members
    .filter((member) => !member.removedAt)
    .map((member) => ({
      name: member.name.trim(),
      providerId: normalizeOptionalTeamProviderId(member.providerId),
    }))
    .filter((member) => member.name.length > 0);

  if (liveMembers.length === 0) {
    return false;
  }

  const normalizedLeadProviderId = normalizeOptionalTeamProviderId(params.leadProviderId);
  const hasOpenCodeProvider =
    normalizedLeadProviderId === 'opencode' ||
    liveMembers.some((member) => member.providerId === 'opencode');
  const hasNonOpenCodeProvider =
    (normalizedLeadProviderId != null && normalizedLeadProviderId !== 'opencode') ||
    liveMembers.some((member) => member.providerId != null && member.providerId !== 'opencode');
  if (hasOpenCodeProvider && hasNonOpenCodeProvider) {
    return true;
  }

  const plan = planTeamRuntimeLanes({
    leadProviderId: normalizedLeadProviderId,
    members: liveMembers,
  });

  return plan.ok && isMixedOpenCodeSideLanePlan(plan.plan);
}
