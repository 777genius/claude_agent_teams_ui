import { BoardTaskActivityTranscriptReader } from '../taskLogs/activity/BoardTaskActivityTranscriptReader';
import { isBoardTaskActivityReadEnabled } from '../taskLogs/activity/featureGates';
import { TeamTranscriptSourceLocator } from '../taskLogs/discovery/TeamTranscriptSourceLocator';
import { isBoardTaskExactLogsReadEnabled } from '../taskLogs/exact/featureGates';
import { TeamKanbanManager } from '../TeamKanbanManager';
import { TeamTaskReader } from '../TeamTaskReader';
import { TeamMembersMetaStore } from '../TeamMembersMetaStore';

import { BoardTaskActivityBatchIndexer } from './BoardTaskActivityBatchIndexer';
import { buildResolvedReviewerIndex } from './reviewerResolution';
import { TeamTaskLogFreshnessReader } from './TeamTaskLogFreshnessReader';
import { TeamTaskStallExactRowReader } from './TeamTaskStallExactRowReader';
import {
  inferTeamProviderIdFromModel,
  normalizeOptionalTeamProviderId,
} from '@shared/utils/teamProvider';

import type { BoardTaskActivityRecord } from '../taskLogs/activity/BoardTaskActivityRecord';
import type { TeamTaskStallSnapshot } from './TeamTaskStallTypes';
import type { TeamConfig, TeamMember, TeamProviderId, TeamTask } from '@shared/types';

function resolveLeadNameFromConfig(config: TeamConfig): string {
  const lead = config.members?.find((member) => member.role?.toLowerCase().includes('lead'));
  return lead?.name ?? config.members?.[0]?.name ?? 'team-lead';
}

function normalizeMemberNameKey(name: string | undefined): string | null {
  const normalized = name?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function resolveMemberProvider(member: TeamMember): TeamProviderId | undefined {
  const legacyProvider = (member as { provider?: unknown }).provider;
  return (
    normalizeOptionalTeamProviderId(member.providerId) ??
    normalizeOptionalTeamProviderId(legacyProvider) ??
    inferTeamProviderIdFromModel(member.model)
  );
}

function buildProviderByMemberName(args: {
  configMembers: TeamMember[];
  metaMembers: TeamMember[];
}): Map<string, TeamProviderId> {
  const providerByMemberName = new Map<string, TeamProviderId>();
  for (const member of args.configMembers) {
    const memberName = normalizeMemberNameKey(member.name);
    const providerId = resolveMemberProvider(member);
    if (memberName && providerId) {
      providerByMemberName.set(memberName, providerId);
    }
  }
  for (const member of args.metaMembers) {
    const memberName = normalizeMemberNameKey(member.name);
    const providerId = resolveMemberProvider(member);
    if (memberName && providerId) {
      providerByMemberName.set(memberName, providerId);
    }
  }
  return providerByMemberName;
}

export class TeamTaskStallSnapshotSource {
  constructor(
    private readonly transcriptSourceLocator: TeamTranscriptSourceLocator = new TeamTranscriptSourceLocator(),
    private readonly taskReader: TeamTaskReader = new TeamTaskReader(),
    private readonly kanbanManager: TeamKanbanManager = new TeamKanbanManager(),
    private readonly transcriptReader: BoardTaskActivityTranscriptReader = new BoardTaskActivityTranscriptReader(),
    private readonly activityBatchIndexer: BoardTaskActivityBatchIndexer = new BoardTaskActivityBatchIndexer(),
    private readonly freshnessReader: TeamTaskLogFreshnessReader = new TeamTaskLogFreshnessReader(),
    private readonly exactRowReader: TeamTaskStallExactRowReader = new TeamTaskStallExactRowReader(),
    private readonly membersMetaStore: TeamMembersMetaStore = new TeamMembersMetaStore()
  ) {}

  async getSnapshot(teamName: string): Promise<TeamTaskStallSnapshot | null> {
    const transcriptContext = await this.transcriptSourceLocator.getContext(teamName);
    if (!transcriptContext) {
      return null;
    }

    const [activeTasks, deletedTasks, kanbanState, metaMembers] = await Promise.all([
      this.taskReader.getTasks(teamName),
      this.taskReader.getDeletedTasks(teamName),
      this.kanbanManager.getState(teamName),
      this.membersMetaStore.getMembers(teamName).catch(() => []),
    ]);
    const allTasks = [...activeTasks, ...deletedTasks];
    const allTasksById = new Map(allTasks.map((task) => [task.id, task] as const));
    const inProgressTasks = activeTasks.filter(
      (task) => task.status === 'in_progress' && task.reviewState !== 'review'
    );
    const reviewOpenTasks = activeTasks.filter((task) => task.reviewState === 'review');
    const resolvedReviewersByTaskId = buildResolvedReviewerIndex(activeTasks, kanbanState);
    const activityReadsEnabled = isBoardTaskActivityReadEnabled();
    const exactReadsEnabled = isBoardTaskExactLogsReadEnabled();
    const providerByMemberName = buildProviderByMemberName({
      configMembers: transcriptContext.config.members ?? [],
      metaMembers,
    });

    let recordsByTaskId = new Map<string, BoardTaskActivityRecord[]>();
    if (
      activityReadsEnabled &&
      allTasks.length > 0 &&
      transcriptContext.transcriptFiles.length > 0
    ) {
      const messages = await this.transcriptReader.readFiles(transcriptContext.transcriptFiles);
      recordsByTaskId = this.activityBatchIndexer.buildIndex({
        teamName,
        tasks: allTasks,
        messages,
      });
    }

    const relevantMonitorTasks = [...inProgressTasks, ...reviewOpenTasks];
    const relevantExactFiles = this.collectRelevantExactFiles(
      relevantMonitorTasks,
      recordsByTaskId
    );
    const [freshnessByTaskId, exactRowsByFilePath] = await Promise.all([
      this.freshnessReader.readSignals(
        transcriptContext.projectDir,
        relevantMonitorTasks.map((task) => task.id)
      ),
      exactReadsEnabled
        ? this.exactRowReader.parseFiles(relevantExactFiles)
        : Promise.resolve(new Map()),
    ]);

    return {
      teamName,
      scannedAt: new Date().toISOString(),
      projectDir: transcriptContext.projectDir,
      projectId: transcriptContext.projectId,
      leadName: resolveLeadNameFromConfig(transcriptContext.config),
      transcriptFiles: transcriptContext.transcriptFiles,
      activityReadsEnabled,
      exactReadsEnabled,
      activeTasks,
      deletedTasks,
      allTasksById,
      inProgressTasks,
      reviewOpenTasks,
      resolvedReviewersByTaskId,
      recordsByTaskId,
      freshnessByTaskId,
      exactRowsByFilePath,
      providerByMemberName,
    };
  }

  private collectRelevantExactFiles(
    inProgressTasks: TeamTask[],
    recordsByTaskId: Map<string, BoardTaskActivityRecord[]>
  ): string[] {
    const filePaths = new Set<string>();

    for (const task of inProgressTasks) {
      const records = recordsByTaskId.get(task.id) ?? [];
      for (const record of records) {
        filePaths.add(record.source.filePath);
      }
    }

    return [...filePaths].sort((left, right) => left.localeCompare(right));
  }
}
