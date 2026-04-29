import path from 'path';

import { isReservedMemberName, normalizeMemberName } from '../../../core/domain';
import type {
  RuntimeTurnSettledTargetResolution,
  RuntimeTurnSettledTargetResolverPort,
} from '../../../core/application';
import { TeamMemberLogsFinder } from '@main/services/team/TeamMemberLogsFinder';
import {
  inferTeamProviderIdFromModel,
  normalizeOptionalTeamProviderId,
} from '@shared/utils/teamProvider';

import type { RuntimeTurnSettledEvent } from '../../../core/domain';
import type { TeamConfigReader } from '@main/services/team/TeamConfigReader';
import type { TeamMembersMetaStore } from '@main/services/team/TeamMembersMetaStore';
import type { TeamMember, TeamSummary } from '@shared/types';

export interface RuntimeTurnSettledTeamSource {
  listTeams(): Promise<TeamSummary[]>;
  getConfig(teamName: string): ReturnType<TeamConfigReader['getConfig']>;
}

export interface AttributedMemberFileSource {
  listAttributedMemberFiles(
    teamName: string
  ): Promise<{ memberName: string; sessionId: string; filePath: string; mtimeMs: number }[]>;
}

export interface TeamRuntimeTurnSettledTargetResolverDeps {
  teamSource: RuntimeTurnSettledTeamSource;
  membersMetaStore: TeamMembersMetaStore;
  memberLogsFinder?: AttributedMemberFileSource;
  maxTeamsToScan?: number;
}

function memberKey(member: Pick<TeamMember, 'name'>): string {
  return normalizeMemberName(member.name);
}

function mergeMembers(configMembers: TeamMember[], metaMembers: TeamMember[]): TeamMember[] {
  const byName = new Map<string, TeamMember>();
  for (const member of configMembers) {
    const key = memberKey(member);
    if (key) {
      byName.set(key, member);
    }
  }
  for (const member of metaMembers) {
    const key = memberKey(member);
    if (key) {
      byName.set(key, { ...byName.get(key), ...member });
    }
  }
  return [...byName.values()];
}

function providerForMember(member: TeamMember | undefined): string | undefined {
  return (
    normalizeOptionalTeamProviderId(member?.providerId) ??
    inferTeamProviderIdFromModel(member?.model)
  );
}

function normalizePath(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  return path.resolve(value.trim());
}

export class TeamRuntimeTurnSettledTargetResolver
  implements RuntimeTurnSettledTargetResolverPort
{
  private readonly memberLogsFinder: AttributedMemberFileSource;
  private readonly maxTeamsToScan: number;

  constructor(private readonly deps: TeamRuntimeTurnSettledTargetResolverDeps) {
    this.memberLogsFinder = deps.memberLogsFinder ?? new TeamMemberLogsFinder();
    this.maxTeamsToScan = Math.max(1, deps.maxTeamsToScan ?? 200);
  }

  async resolve(event: RuntimeTurnSettledEvent): Promise<RuntimeTurnSettledTargetResolution> {
    if (event.provider === 'codex') {
      return this.resolveCodexEvent(event);
    }

    if (event.provider !== 'claude') {
      return { ok: false, reason: 'unsupported_provider' };
    }

    const transcriptPath = normalizePath(event.transcriptPath);
    const sessionId = event.sessionId?.trim() || null;
    if (!transcriptPath && !sessionId) {
      return { ok: false, reason: 'missing_session_identity' };
    }

    const teams = (await this.deps.teamSource.listTeams())
      .filter((team) => !team.deletedAt)
      .slice(0, this.maxTeamsToScan);

    const candidates: Array<{
      teamName: string;
      memberName: string;
      exactPath: boolean;
      mtimeMs: number;
    }> = [];

    for (const team of teams) {
      const attributedFiles = await this.memberLogsFinder
        .listAttributedMemberFiles(team.teamName)
        .catch(() => []);
      for (const file of attributedFiles) {
        const exactPath = transcriptPath ? normalizePath(file.filePath) === transcriptPath : false;
        const sessionMatch = sessionId ? file.sessionId === sessionId : false;
        if (!exactPath && !sessionMatch) {
          continue;
        }
        candidates.push({
          teamName: team.teamName,
          memberName: file.memberName,
          exactPath,
          mtimeMs: file.mtimeMs,
        });
      }
    }

    const candidate = candidates.sort((left, right) => {
      if (left.exactPath !== right.exactPath) {
        return left.exactPath ? -1 : 1;
      }
      return right.mtimeMs - left.mtimeMs;
    })[0];

    if (!candidate) {
      return { ok: false, reason: 'no_matching_member_session' };
    }

    const member = await this.resolveActiveMember(candidate.teamName, candidate.memberName);
    if (!member) {
      return { ok: false, reason: 'member_not_active' };
    }
    if (isReservedMemberName(member.name)) {
      return { ok: false, reason: 'reserved_member' };
    }

    const providerId = providerForMember(member);
    if (providerId && providerId !== 'anthropic') {
      return { ok: false, reason: 'provider_mismatch' };
    }

    return {
      ok: true,
      teamName: candidate.teamName,
      memberName: normalizeMemberName(member.name),
    };
  }

  private async resolveCodexEvent(
    event: RuntimeTurnSettledEvent
  ): Promise<RuntimeTurnSettledTargetResolution> {
    const teamName = event.teamName?.trim();
    const memberName = event.memberName?.trim();
    if (!teamName || !memberName) {
      return { ok: false, reason: 'missing_team_member_identity' };
    }

    const member = await this.resolveActiveMember(teamName, memberName);
    if (!member) {
      return { ok: false, reason: 'member_not_active' };
    }
    if (isReservedMemberName(member.name)) {
      return { ok: false, reason: 'reserved_member' };
    }

    const providerId = providerForMember(member);
    if (providerId && providerId !== 'codex') {
      return { ok: false, reason: 'provider_mismatch' };
    }

    return {
      ok: true,
      teamName,
      memberName: normalizeMemberName(member.name),
    };
  }

  private async resolveActiveMember(
    teamName: string,
    memberName: string
  ): Promise<TeamMember | null> {
    const [config, metaMembers] = await Promise.all([
      this.deps.teamSource.getConfig(teamName),
      this.deps.membersMetaStore.getMembers(teamName).catch(() => []),
    ]);
    if (!config || config.deletedAt) {
      return null;
    }

    const normalizedTarget = normalizeMemberName(memberName);
    return (
      mergeMembers(config.members ?? [], metaMembers).find(
        (member) => !member.removedAt && memberKey(member) === normalizedTarget
      ) ?? null
    );
  }
}
