import type {
  MemberWorkSyncReportRequest,
  MemberWorkSyncReportResult,
  MemberWorkSyncStatus,
  MemberWorkSyncStatusRequest,
} from '../../contracts';
import { MemberWorkSyncDiagnosticsReader, MemberWorkSyncReporter } from '../../core/application';
import { TeamTaskAgendaSource } from '../adapters/output/TeamTaskAgendaSource';
import { JsonMemberWorkSyncStore } from '../infrastructure/JsonMemberWorkSyncStore';
import { MemberWorkSyncStorePaths } from '../infrastructure/MemberWorkSyncStorePaths';
import { NodeHashAdapter } from '../infrastructure/NodeHashAdapter';
import { SystemClockAdapter } from '../infrastructure/SystemClockAdapter';

import type { TeamConfigReader } from '@main/services/team/TeamConfigReader';
import type { TeamKanbanManager } from '@main/services/team/TeamKanbanManager';
import type { TeamMembersMetaStore } from '@main/services/team/TeamMembersMetaStore';
import type { TeamTaskReader } from '@main/services/team/TeamTaskReader';
import type { MemberWorkSyncLoggerPort } from '../../core/application';

export interface MemberWorkSyncFeatureFacade {
  getStatus(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus>;
  report(request: MemberWorkSyncReportRequest): Promise<MemberWorkSyncReportResult>;
}

export function createMemberWorkSyncFeature(deps: {
  teamsBasePath: string;
  configReader: TeamConfigReader;
  taskReader: TeamTaskReader;
  kanbanManager: TeamKanbanManager;
  membersMetaStore: TeamMembersMetaStore;
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
  const store = new JsonMemberWorkSyncStore(new MemberWorkSyncStorePaths(deps.teamsBasePath));
  const useCaseDeps = {
    clock,
    hash,
    agendaSource,
    statusStore: store,
    reportStore: store,
    logger: deps.logger,
  };
  const diagnosticsReader = new MemberWorkSyncDiagnosticsReader(useCaseDeps);
  const reporter = new MemberWorkSyncReporter(useCaseDeps);

  return {
    getStatus: (request) => diagnosticsReader.execute(request),
    report: (request) => reporter.execute(request),
  };
}
