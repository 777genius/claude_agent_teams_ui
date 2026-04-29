import type {
  MemberWorkSyncMetricsRequest,
  MemberWorkSyncReportRequest,
  MemberWorkSyncReportResult,
  MemberWorkSyncStatus,
  MemberWorkSyncStatusRequest,
  MemberWorkSyncTeamMetrics,
} from '../../contracts';
import {
  MemberWorkSyncDiagnosticsReader,
  MemberWorkSyncMetricsReader,
  MemberWorkSyncNudgeDispatcher,
  type MemberWorkSyncNudgeDispatchSummary,
  MemberWorkSyncPendingReportIntentReplayer,
  type MemberWorkSyncPendingReportReplaySummary,
  MemberWorkSyncReconciler,
  MemberWorkSyncReporter,
  type MemberWorkSyncReconcileContext,
} from '../../core/application';
import { MemberWorkSyncTeamChangeRouter } from '../adapters/input/MemberWorkSyncTeamChangeRouter';
import { TeamInboxMemberWorkSyncNudgeSink } from '../adapters/output/TeamInboxMemberWorkSyncNudgeSink';
import { TeamTaskAgendaSource } from '../adapters/output/TeamTaskAgendaSource';
import { HmacMemberWorkSyncReportTokenAdapter } from '../infrastructure/HmacMemberWorkSyncReportTokenAdapter';
import {
  MemberWorkSyncEventQueue,
  type MemberWorkSyncQueueDiagnostics,
} from '../infrastructure/MemberWorkSyncEventQueue';
import { JsonMemberWorkSyncStore } from '../infrastructure/JsonMemberWorkSyncStore';
import { MemberWorkSyncStorePaths } from '../infrastructure/MemberWorkSyncStorePaths';
import { NodeHashAdapter } from '../infrastructure/NodeHashAdapter';
import { SystemClockAdapter } from '../infrastructure/SystemClockAdapter';

import type { TeamConfigReader } from '@main/services/team/TeamConfigReader';
import type { TeamKanbanManager } from '@main/services/team/TeamKanbanManager';
import type { TeamMembersMetaStore } from '@main/services/team/TeamMembersMetaStore';
import type { TeamTaskReader } from '@main/services/team/TeamTaskReader';
import type { TeamChangeEvent } from '@shared/types';
import type { MemberWorkSyncLoggerPort } from '../../core/application';

export interface MemberWorkSyncFeatureFacade {
  getStatus(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus>;
  getMetrics(request: MemberWorkSyncMetricsRequest): Promise<MemberWorkSyncTeamMetrics>;
  report(request: MemberWorkSyncReportRequest): Promise<MemberWorkSyncReportResult>;
  noteTeamChange(event: TeamChangeEvent): void;
  enqueueStartupScan(teamNames: string[]): Promise<void>;
  replayPendingReports(teamNames: string[]): Promise<MemberWorkSyncPendingReportReplaySummary>;
  dispatchDueNudges(teamNames: string[]): Promise<MemberWorkSyncNudgeDispatchSummary>;
  getQueueDiagnostics(): MemberWorkSyncQueueDiagnostics;
  dispose(): Promise<void>;
}

export function createMemberWorkSyncFeature(deps: {
  teamsBasePath: string;
  configReader: TeamConfigReader;
  taskReader: TeamTaskReader;
  kanbanManager: TeamKanbanManager;
  membersMetaStore: TeamMembersMetaStore;
  isTeamActive?: (teamName: string) => Promise<boolean> | boolean;
  logger?: MemberWorkSyncLoggerPort;
}): MemberWorkSyncFeatureFacade {
  const clock = new SystemClockAdapter();
  const hash = new NodeHashAdapter();
  const agendaSource = new TeamTaskAgendaSource({
    configReader: deps.configReader,
    taskReader: deps.taskReader,
    kanbanManager: deps.kanbanManager,
    membersMetaStore: deps.membersMetaStore,
    hash,
    clock,
  });
  const storePaths = new MemberWorkSyncStorePaths(deps.teamsBasePath);
  const store = new JsonMemberWorkSyncStore(storePaths);
  const reportToken = new HmacMemberWorkSyncReportTokenAdapter(storePaths);
  const inboxNudge = new TeamInboxMemberWorkSyncNudgeSink();
  const useCaseDeps = {
    clock,
    hash,
    agendaSource,
    statusStore: store,
    reportStore: store,
    outboxStore: store,
    inboxNudge,
    reportToken,
    ...(deps.isTeamActive ? { lifecycle: { isTeamActive: deps.isTeamActive } } : {}),
    logger: deps.logger,
  };
  const diagnosticsReader = new MemberWorkSyncDiagnosticsReader(useCaseDeps);
  const metricsReader = new MemberWorkSyncMetricsReader(useCaseDeps);
  const reporter = new MemberWorkSyncReporter(useCaseDeps);
  const reconciler = new MemberWorkSyncReconciler(useCaseDeps);
  const pendingReportReplayer = new MemberWorkSyncPendingReportIntentReplayer(useCaseDeps);
  const nudgeDispatcher = new MemberWorkSyncNudgeDispatcher(useCaseDeps);
  const queue = new MemberWorkSyncEventQueue({
    reconcile: async (request, context: MemberWorkSyncReconcileContext) => {
      await reconciler.execute(request, context);
    },
    isTeamActive: deps.isTeamActive ?? (() => true),
    logger: deps.logger,
  });
  const router = new MemberWorkSyncTeamChangeRouter(agendaSource, queue);

  return {
    getStatus: (request) => diagnosticsReader.execute(request),
    getMetrics: (request) => metricsReader.execute(request),
    report: (request) => reporter.execute(request),
    noteTeamChange: (event) => router.noteTeamChange(event),
    enqueueStartupScan: (teamNames) => router.enqueueStartupScan(teamNames),
    replayPendingReports: async (teamNames) => {
      const summaries = await Promise.allSettled(
        teamNames.map((teamName) => pendingReportReplayer.replayTeam(teamName))
      );
      return summaries.reduce<MemberWorkSyncPendingReportReplaySummary>(
        (accumulator, summary) => {
          if (summary.status !== 'fulfilled') {
            return accumulator;
          }
          accumulator.processed += summary.value.processed;
          accumulator.accepted += summary.value.accepted;
          accumulator.rejected += summary.value.rejected;
          accumulator.superseded += summary.value.superseded;
          return accumulator;
        },
        { processed: 0, accepted: 0, rejected: 0, superseded: 0 }
      );
    },
    dispatchDueNudges: (teamNames) =>
      nudgeDispatcher.dispatchDue({ teamNames, claimedBy: `member-work-sync:${process.pid}` }),
    getQueueDiagnostics: () => queue.getDiagnostics(),
    dispose: () => queue.stop(),
  };
}
