import {
  buildActionableWorkAgenda,
  normalizeMemberName,
  type MemberWorkSyncMemberLike,
} from '../../../core/domain';
import type {
  MemberWorkSyncAgendaSourcePort,
  MemberWorkSyncAgendaSourceResult,
  MemberWorkSyncHashPort,
} from '../../../core/application';
import {
  inferTeamProviderIdFromModel,
  normalizeOptionalTeamProviderId,
} from '@shared/utils/teamProvider';

import type { TeamConfigReader } from '@main/services/team/TeamConfigReader';
import type { TeamKanbanManager } from '@main/services/team/TeamKanbanManager';
import type { TeamMembersMetaStore } from '@main/services/team/TeamMembersMetaStore';
import type { TeamTaskReader } from '@main/services/team/TeamTaskReader';
import type { TeamMember } from '@shared/types';

export interface TeamTaskAgendaSourceDeps {
  configReader: TeamConfigReader;
  taskReader: TeamTaskReader;
  kanbanManager: TeamKanbanManager;
  membersMetaStore: TeamMembersMetaStore;
  hash: MemberWorkSyncHashPort;
  clock: { now(): Date };
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

function toMemberLike(member: TeamMember): MemberWorkSyncMemberLike {
  const providerId =
    normalizeOptionalTeamProviderId(member.providerId) ??
    inferTeamProviderIdFromModel(member.model);
  return {
    name: member.name,
    ...(providerId ? { providerId } : {}),
    ...(member.model ? { model: member.model } : {}),
    ...(member.agentType ? { agentType: member.agentType } : {}),
    ...(member.removedAt ? { removedAt: String(member.removedAt) } : {}),
  };
}

export class TeamTaskAgendaSource implements MemberWorkSyncAgendaSourcePort {
  constructor(private readonly deps: TeamTaskAgendaSourceDeps) {}

  async loadAgenda(input: {
    teamName: string;
    memberName: string;
  }): Promise<MemberWorkSyncAgendaSourceResult> {
    const config = await this.deps.configReader.getConfig(input.teamName);
    if (!config || config.deletedAt) {
      const nowIso = this.deps.clock.now().toISOString();
      return {
        agenda: {
          teamName: input.teamName,
          memberName: normalizeMemberName(input.memberName),
          generatedAt: nowIso,
          items: [],
          diagnostics: config?.deletedAt ? ['team_deleted'] : ['team_config_missing'],
        },
        activeMemberNames: [],
        inactive: true,
        diagnostics: [],
      };
    }

    const [tasks, kanban, metaMembers] = await Promise.all([
      this.deps.taskReader.getTasks(input.teamName),
      this.deps.kanbanManager.getState(input.teamName),
      this.deps.membersMetaStore.getMembers(input.teamName),
    ]);
    const members = mergeMembers(config.members ?? [], metaMembers);
    const activeMemberNames = members
      .filter((member) => !member.removedAt)
      .map((member) => normalizeMemberName(member.name))
      .filter(Boolean);
    const normalizedMemberName = normalizeMemberName(input.memberName);
    const member = members.find((candidate) => memberKey(candidate) === normalizedMemberName);
    const providerId =
      normalizeOptionalTeamProviderId(member?.providerId) ??
      inferTeamProviderIdFromModel(member?.model);

    const agenda = buildActionableWorkAgenda({
      teamName: input.teamName,
      memberName: input.memberName,
      generatedAt: this.deps.clock.now().toISOString(),
      tasks,
      members: members.map(toMemberLike),
      kanbanReviewersByTaskId: Object.fromEntries(
        Object.entries(kanban.tasks).map(([taskId, value]) => [taskId, value.reviewer ?? null])
      ),
      hash: this.deps.hash.sha256Hex.bind(this.deps.hash),
    });

    return {
      agenda,
      activeMemberNames,
      inactive: !activeMemberNames.includes(normalizedMemberName),
      ...(providerId ? { providerId } : {}),
      diagnostics: [],
    };
  }
}
