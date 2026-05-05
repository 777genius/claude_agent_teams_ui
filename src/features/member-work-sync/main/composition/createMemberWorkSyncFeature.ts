import {
  MemberWorkSyncDiagnosticsReader,
  MemberWorkSyncMetricsReader,
  MemberWorkSyncNudgeDispatcher,
  type MemberWorkSyncNudgeDispatchSummary,
  MemberWorkSyncPendingReportIntentReplayer,
  type MemberWorkSyncPendingReportReplaySummary,
  type MemberWorkSyncReconcileContext,
  MemberWorkSyncReconciler,
  MemberWorkSyncReporter,
  type RuntimeTurnSettledDrainSummary,
  RuntimeTurnSettledIngestor,
  type RuntimeTurnSettledTargetResolverPort,
} from '../../core/application';
import { MemberWorkSyncTeamChangeRouter } from '../adapters/input/MemberWorkSyncTeamChangeRouter';
import { MemberWorkSyncTaskImpactResolver } from '../adapters/input/MemberWorkSyncTaskImpactResolver';
import { TeamInboxMemberWorkSyncNudgeSink } from '../adapters/output/TeamInboxMemberWorkSyncNudgeSink';
import { TeamRuntimeTurnSettledTargetResolver } from '../adapters/output/TeamRuntimeTurnSettledTargetResolver';
import { TeamTaskAgendaSource } from '../adapters/output/TeamTaskAgendaSource';
import { TeamTaskStallJournalWorkSyncCooldown } from '../adapters/output/TeamTaskStallJournalWorkSyncCooldown';
import { ClaudeStopHookPayloadNormalizer } from '../infrastructure/ClaudeStopHookPayloadNormalizer';
import { CodexNativeTurnSettledPayloadNormalizer } from '../infrastructure/CodexNativeTurnSettledPayloadNormalizer';
import { CompositeRuntimeTurnSettledPayloadNormalizer } from '../infrastructure/CompositeRuntimeTurnSettledPayloadNormalizer';
import { FileMemberWorkSyncAuditJournal } from '../infrastructure/FileMemberWorkSyncAuditJournal';
import { FileRuntimeTurnSettledEventStore } from '../infrastructure/FileRuntimeTurnSettledEventStore';
import { HmacMemberWorkSyncReportTokenAdapter } from '../infrastructure/HmacMemberWorkSyncReportTokenAdapter';
import { JsonMemberWorkSyncStore } from '../infrastructure/JsonMemberWorkSyncStore';
import {
  MemberWorkSyncEventQueue,
  type MemberWorkSyncQueueDiagnostics,
} from '../infrastructure/MemberWorkSyncEventQueue';
import { MemberWorkSyncNudgeDispatchScheduler } from '../infrastructure/MemberWorkSyncNudgeDispatchScheduler';
import { MemberWorkSyncStorePaths } from '../infrastructure/MemberWorkSyncStorePaths';
import { MemberWorkSyncToolActivityBusySignal } from '../infrastructure/MemberWorkSyncToolActivityBusySignal';
import { NodeHashAdapter } from '../infrastructure/NodeHashAdapter';
import { OpenCodeTurnSettledPayloadNormalizer } from '../infrastructure/OpenCodeTurnSettledPayloadNormalizer';
import { RuntimeTurnSettledDrainScheduler } from '../infrastructure/RuntimeTurnSettledDrainScheduler';
import { RuntimeTurnSettledSpoolInitializer } from '../infrastructure/RuntimeTurnSettledSpoolInitializer';
import { SystemClockAdapter } from '../infrastructure/SystemClockAdapter';

import type {
  MemberWorkSyncMetricsRequest,
  MemberWorkSyncReportRequest,
  MemberWorkSyncReportResult,
  MemberWorkSyncStatus,
  MemberWorkSyncStatusRequest,
  MemberWorkSyncTeamMetrics,
} from '../../contracts';
import type { MemberWorkSyncLoggerPort } from '../../core/application';
import type { RuntimeTurnSettledProvider } from '../../core/domain';
import type { TeamConfigReader } from '@main/services/team/TeamConfigReader';
import type { TeamKanbanManager } from '@main/services/team/TeamKanbanManager';
import type { TeamMembersMetaStore } from '@main/services/team/TeamMembersMetaStore';
import type { TeamTaskReader } from '@main/services/team/TeamTaskReader';
import type { TeamChangeEvent } from '@shared/types';

export function buildMemberWorkSyncRuntimeTurnSettledEnvironment(input: {
  teamsBasePath: string;
  provider: RuntimeTurnSettledProvider;
}): Promise<Record<string, string> | null> {
  return new RuntimeTurnSettledSpoolInitializer(input.teamsBasePath).buildEnvironment({
    provider: input.provider,
  });
}

export interface MemberWorkSyncFeatureFacade {
  getStatus(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus>;
  refreshStatus(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus>;
  getMetrics(request: MemberWorkSyncMetricsRequest): Promise<MemberWorkSyncTeamMetrics>;
  report(request: MemberWorkSyncReportRequest): Promise<MemberWorkSyncReportResult>;
  noteTeamChange(event: TeamChangeEvent): void;
  enqueueStartupScan(teamNames: string[]): Promise<void>;
  replayPendingReports(teamNames: string[]): Promise<MemberWorkSyncPendingReportReplaySummary>;
  dispatchDueNudges(teamNames: string[]): Promise<MemberWorkSyncNudgeDispatchSummary>;
  buildRuntimeTurnSettledHookSettings(input: {
    provider: RuntimeTurnSettledProvider;
  }): Promise<Record<string, unknown> | null>;
  buildRuntimeTurnSettledEnvironment(input: {
    provider: RuntimeTurnSettledProvider;
  }): Promise<Record<string, string> | null>;
  drainRuntimeTurnSettledEvents(): Promise<RuntimeTurnSettledDrainSummary>;
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
  listLifecycleActiveTeamNames?: () => Promise<string[]>;
  queueQuietWindowMs?: number;
  runtimeTurnSettledTargetResolver?: RuntimeTurnSettledTargetResolverPort;
  logger?: MemberWorkSyncLoggerPort;
}): MemberWorkSyncFeatureFacade {
  const clock = new SystemClockAdapter();
  const hash = new NodeHashAdapter();
  const configReaderForReadOnlySync = {
    listTeams: () =>
      typeof deps.configReader.listTeams === 'function'
        ? deps.configReader.listTeams()
        : Promise.resolve([]),
    getConfig: (teamName: string) =>
      typeof deps.configReader.getConfigSnapshot === 'function'
        ? deps.configReader.getConfigSnapshot(teamName)
        : deps.configReader.getConfig(teamName),
  };
  const agendaSource = new TeamTaskAgendaSource({
    configReader: configReaderForReadOnlySync,
    taskReader: deps.taskReader,
    kanbanManager: deps.kanbanManager,
    membersMetaStore: deps.membersMetaStore,
    hash,
    clock,
  });
  const storePaths = new MemberWorkSyncStorePaths(deps.teamsBasePath);
  const auditJournal = new FileMemberWorkSyncAuditJournal(storePaths, deps.logger);
  const store = new JsonMemberWorkSyncStore(storePaths, {
    auditJournal,
    logger: deps.logger,
  });
  const runtimeTurnSettledSpool = new RuntimeTurnSettledSpoolInitializer(deps.teamsBasePath);
  const runtimeTurnSettledStore = new FileRuntimeTurnSettledEventStore({
    paths: runtimeTurnSettledSpool.getPaths(),
  });
  const runtimeTurnSettledNormalizer = new CompositeRuntimeTurnSettledPayloadNormalizer([
    new ClaudeStopHookPayloadNormalizer(hash),
    new CodexNativeTurnSettledPayloadNormalizer(hash),
    new OpenCodeTurnSettledPayloadNormalizer(hash),
  ]);
  const runtimeTurnSettledTargetResolver =
    deps.runtimeTurnSettledTargetResolver ??
    new TeamRuntimeTurnSettledTargetResolver({
      teamSource: configReaderForReadOnlySync,
      membersMetaStore: deps.membersMetaStore,
    });
  const reportToken = new HmacMemberWorkSyncReportTokenAdapter(storePaths);
  const watchdogCooldown = new TeamTaskStallJournalWorkSyncCooldown(deps.teamsBasePath);
  const busySignal = new MemberWorkSyncToolActivityBusySignal();
  const inboxNudge = new TeamInboxMemberWorkSyncNudgeSink();
  const useCaseDeps = {
    clock,
    hash,
    agendaSource,
    statusStore: store,
    reportStore: store,
    outboxStore: store,
    inboxNudge,
    watchdogCooldown,
    busySignal,
    reportToken,
    auditJournal,
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
      await nudgeDispatcher.dispatchDue({
        teamNames: [request.teamName],
        claimedBy: `member-work-sync:${process.pid}`,
      });
    },
    isTeamActive: deps.isTeamActive ?? (() => true),
    ...(deps.queueQuietWindowMs != null ? { quietWindowMs: deps.queueQuietWindowMs } : {}),
    auditJournal,
    logger: deps.logger,
  });
  const taskImpactResolver = new MemberWorkSyncTaskImpactResolver({
    taskReader: deps.taskReader,
    kanbanManager: deps.kanbanManager,
    activeMemberSource: agendaSource,
  });
  const router = new MemberWorkSyncTeamChangeRouter(
    agendaSource,
    queue,
    {
      materializeMember: (teamName, memberName) =>
        storePaths.ensureMemberWorkSyncDir(teamName, memberName),
    },
    taskImpactResolver
  );
  const runtimeTurnSettledIngestor = new RuntimeTurnSettledIngestor({
    eventStore: runtimeTurnSettledStore,
    normalizer: runtimeTurnSettledNormalizer,
    targetResolver: runtimeTurnSettledTargetResolver,
    reconcileQueue: {
      enqueueRuntimeTurnSettled: ({ teamName, memberName, event }) => {
        router.noteTeamChange({
          type: 'member-turn-settled',
          teamName,
          detail: JSON.stringify({
            memberName,
            sourceId: event.sourceId,
            provider: event.provider,
          }),
        });
      },
    },
    clock,
    auditJournal,
    logger: deps.logger,
  });
  const runtimeTurnSettledDrainScheduler = new RuntimeTurnSettledDrainScheduler({
    drain: () => runtimeTurnSettledIngestor.drainPending(),
    logger: deps.logger,
  });
  const nudgeDispatchScheduler = deps.listLifecycleActiveTeamNames
    ? new MemberWorkSyncNudgeDispatchScheduler({
        listLifecycleActiveTeamNames: deps.listLifecycleActiveTeamNames,
        dispatchDue: (teamNames) =>
          nudgeDispatcher.dispatchDue({
            teamNames,
            claimedBy: `member-work-sync:${process.pid}:scheduled`,
          }),
        logger: deps.logger,
      })
    : null;
  runtimeTurnSettledDrainScheduler.start();
  nudgeDispatchScheduler?.start();

  return {
    getStatus: (request) => diagnosticsReader.execute(request),
    refreshStatus: (request) => reconciler.execute(request, { reconciledBy: 'request' }),
    getMetrics: (request) => metricsReader.execute(request),
    report: (request) => reporter.execute(request),
    noteTeamChange: (event) => {
      busySignal.noteTeamChange(event);
      router.noteTeamChange(event);
    },
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
      nudgeDispatcher.dispatchDue({
        teamNames,
        claimedBy: `member-work-sync:${process.pid}`,
      }),
    buildRuntimeTurnSettledHookSettings: async ({ provider }) =>
      runtimeTurnSettledSpool.buildHookSettings({ provider }),
    buildRuntimeTurnSettledEnvironment: async ({ provider }) =>
      runtimeTurnSettledSpool.buildEnvironment({ provider }),
    drainRuntimeTurnSettledEvents: () => runtimeTurnSettledIngestor.drainPending(),
    getQueueDiagnostics: () => queue.getDiagnostics(),
    dispose: async () => {
      runtimeTurnSettledDrainScheduler.dispose();
      await Promise.allSettled([queue.stop(), nudgeDispatchScheduler?.dispose()]);
    },
  };
}
