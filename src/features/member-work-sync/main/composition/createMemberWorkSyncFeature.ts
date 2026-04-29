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
import { TeamInboxMemberWorkSyncNudgeSink } from '../adapters/output/TeamInboxMemberWorkSyncNudgeSink';
import { TeamRuntimeTurnSettledTargetResolver } from '../adapters/output/TeamRuntimeTurnSettledTargetResolver';
import { TeamTaskAgendaSource } from '../adapters/output/TeamTaskAgendaSource';
import { TeamTaskStallJournalWorkSyncCooldown } from '../adapters/output/TeamTaskStallJournalWorkSyncCooldown';
import { ClaudeStopHookPayloadNormalizer } from '../infrastructure/ClaudeStopHookPayloadNormalizer';
import { CodexNativeTurnSettledPayloadNormalizer } from '../infrastructure/CodexNativeTurnSettledPayloadNormalizer';
import { CompositeRuntimeTurnSettledPayloadNormalizer } from '../infrastructure/CompositeRuntimeTurnSettledPayloadNormalizer';
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
import { RuntimeTurnSettledDrainScheduler } from '../infrastructure/RuntimeTurnSettledDrainScheduler';
import { buildRuntimeTurnSettledEnvironment } from '../infrastructure/runtimeTurnSettledEnvironment';
import { buildRuntimeTurnSettledHookSettings } from '../infrastructure/runtimeTurnSettledHookSettings';
import { RuntimeTurnSettledSpoolPaths } from '../infrastructure/RuntimeTurnSettledSpoolPaths';
import { ShellRuntimeTurnSettledHookScriptInstaller } from '../infrastructure/ShellRuntimeTurnSettledHookScriptInstaller';
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

export const MEMBER_WORK_SYNC_NUDGE_SIDE_EFFECTS_ENV =
  'CLAUDE_TEAM_MEMBER_WORK_SYNC_NUDGES_ENABLED';

const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ENV_VALUES = new Set(['0', 'false', 'no', 'off', '']);

function emptyNudgeDispatchSummary(): MemberWorkSyncNudgeDispatchSummary {
  return { claimed: 0, delivered: 0, superseded: 0, retryable: 0, terminal: 0 };
}

export function resolveMemberWorkSyncNudgeSideEffectsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const rawValue = env[MEMBER_WORK_SYNC_NUDGE_SIDE_EFFECTS_ENV];
  if (rawValue == null) {
    return false;
  }

  const value = rawValue.trim().toLowerCase();
  if (TRUE_ENV_VALUES.has(value)) {
    return true;
  }
  if (FALSE_ENV_VALUES.has(value)) {
    return false;
  }
  return false;
}

export interface MemberWorkSyncFeatureFacade {
  getStatus(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus>;
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
  nudgeSideEffectsEnabled?: boolean;
  queueQuietWindowMs?: number;
  runtimeTurnSettledTargetResolver?: RuntimeTurnSettledTargetResolverPort;
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
  const runtimeTurnSettledSpoolPaths = new RuntimeTurnSettledSpoolPaths(deps.teamsBasePath);
  const runtimeTurnSettledHookInstaller = new ShellRuntimeTurnSettledHookScriptInstaller(
    runtimeTurnSettledSpoolPaths
  );
  const runtimeTurnSettledStore = new FileRuntimeTurnSettledEventStore({
    paths: runtimeTurnSettledSpoolPaths,
  });
  const runtimeTurnSettledNormalizer = new CompositeRuntimeTurnSettledPayloadNormalizer([
    new ClaudeStopHookPayloadNormalizer(hash),
    new CodexNativeTurnSettledPayloadNormalizer(hash),
  ]);
  const runtimeTurnSettledTargetResolver =
    deps.runtimeTurnSettledTargetResolver ??
    new TeamRuntimeTurnSettledTargetResolver({
      teamSource: deps.configReader,
      membersMetaStore: deps.membersMetaStore,
    });
  const reportToken = new HmacMemberWorkSyncReportTokenAdapter(storePaths);
  const watchdogCooldown = new TeamTaskStallJournalWorkSyncCooldown(deps.teamsBasePath);
  const busySignal = new MemberWorkSyncToolActivityBusySignal();
  const nudgeSideEffectsEnabled =
    deps.nudgeSideEffectsEnabled ?? resolveMemberWorkSyncNudgeSideEffectsEnabled();
  const inboxNudge = nudgeSideEffectsEnabled ? new TeamInboxMemberWorkSyncNudgeSink() : null;
  const useCaseDeps = {
    clock,
    hash,
    agendaSource,
    statusStore: store,
    reportStore: store,
    ...(nudgeSideEffectsEnabled ? { outboxStore: store } : {}),
    ...(inboxNudge ? { inboxNudge } : {}),
    watchdogCooldown,
    busySignal,
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
      if (nudgeSideEffectsEnabled) {
        await nudgeDispatcher.dispatchDue({
          teamNames: [request.teamName],
          claimedBy: `member-work-sync:${process.pid}`,
        });
      }
    },
    isTeamActive: deps.isTeamActive ?? (() => true),
    ...(deps.queueQuietWindowMs != null ? { quietWindowMs: deps.queueQuietWindowMs } : {}),
    logger: deps.logger,
  });
  const router = new MemberWorkSyncTeamChangeRouter(agendaSource, queue);
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
    logger: deps.logger,
  });
  const runtimeTurnSettledDrainScheduler = new RuntimeTurnSettledDrainScheduler({
    drain: () => runtimeTurnSettledIngestor.drainPending(),
    logger: deps.logger,
  });
  const nudgeDispatchScheduler =
    nudgeSideEffectsEnabled && deps.listLifecycleActiveTeamNames
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
      nudgeSideEffectsEnabled
        ? nudgeDispatcher.dispatchDue({
            teamNames,
            claimedBy: `member-work-sync:${process.pid}`,
          })
        : Promise.resolve(emptyNudgeDispatchSummary()),
    buildRuntimeTurnSettledHookSettings: async ({ provider }) => {
      if (provider !== 'claude') {
        return null;
      }
      const installed = await runtimeTurnSettledHookInstaller.install();
      return buildRuntimeTurnSettledHookSettings({
        scriptPath: installed.scriptPath,
        spoolRoot: installed.spoolRoot,
        provider,
      });
    },
    buildRuntimeTurnSettledEnvironment: async ({ provider }) => {
      if (provider !== 'codex') {
        return null;
      }
      const installed = await runtimeTurnSettledHookInstaller.install();
      return buildRuntimeTurnSettledEnvironment({
        provider,
        spoolRoot: installed.spoolRoot,
      });
    },
    drainRuntimeTurnSettledEvents: () => runtimeTurnSettledIngestor.drainPending(),
    getQueueDiagnostics: () => queue.getDiagnostics(),
    dispose: async () => {
      runtimeTurnSettledDrainScheduler.dispose();
      await Promise.allSettled([queue.stop(), nudgeDispatchScheduler?.dispose()]);
    },
  };
}
