import type {
  MemberWorkSyncReportRequest,
  MemberWorkSyncReportResult,
  MemberWorkSyncStatus,
  MemberWorkSyncStatusRequest,
} from '../../contracts';
import {
  MemberWorkSyncDiagnosticsReader,
  MemberWorkSyncReconciler,
  MemberWorkSyncReporter,
  type MemberWorkSyncReconcileContext,
} from '../../core/application';
import { MemberWorkSyncTeamChangeRouter } from '../adapters/input/MemberWorkSyncTeamChangeRouter';
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
  report(request: MemberWorkSyncReportRequest): Promise<MemberWorkSyncReportResult>;
  noteTeamChange(event: TeamChangeEvent): void;
  enqueueStartupScan(teamNames: string[]): Promise<void>;
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
  const useCaseDeps = {
    clock,
    hash,
    agendaSource,
    statusStore: store,
    reportStore: store,
    reportToken,
    ...(deps.isTeamActive ? { lifecycle: { isTeamActive: deps.isTeamActive } } : {}),
    logger: deps.logger,
  };
  const diagnosticsReader = new MemberWorkSyncDiagnosticsReader(useCaseDeps);
  const reporter = new MemberWorkSyncReporter(useCaseDeps);
  const reconciler = new MemberWorkSyncReconciler(useCaseDeps);
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
    report: (request) => reporter.execute(request),
    noteTeamChange: (event) => router.noteTeamChange(event),
    enqueueStartupScan: (teamNames) => router.enqueueStartupScan(teamNames),
    getQueueDiagnostics: () => queue.getDiagnostics(),
    dispose: () => queue.stop(),
  };
}
