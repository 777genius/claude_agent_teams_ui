import { decideMemberWorkSyncStatus } from '../domain';
import { finalizeMemberWorkSyncAgenda } from './MemberWorkSyncReconciler';

import type { MemberWorkSyncStatus, MemberWorkSyncStatusRequest } from '../../contracts';
import type { MemberWorkSyncUseCaseDeps } from './ports';

export class MemberWorkSyncDiagnosticsReader {
  constructor(private readonly deps: MemberWorkSyncUseCaseDeps) {}

  async execute(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus> {
    const stored = await this.deps.statusStore.read(request);
    if (stored) {
      return stored;
    }

    const source = await this.deps.agendaSource.loadAgenda(request);
    const agenda = finalizeMemberWorkSyncAgenda(this.deps, source);
    const nowIso = this.deps.clock.now().toISOString();
    const teamActive = this.deps.lifecycle
      ? await this.deps.lifecycle.isTeamActive(agenda.teamName)
      : true;
    const decision = decideMemberWorkSyncStatus({
      agenda,
      nowIso,
      inactive: source.inactive || !teamActive,
    });

    return {
      teamName: agenda.teamName,
      memberName: agenda.memberName,
      state: decision.state,
      agenda,
      shadow: {
        reconciledBy: 'request',
        wouldNudge: false,
        fingerprintChanged: false,
      },
      evaluatedAt: nowIso,
      diagnostics: [
        ...agenda.diagnostics,
        ...(!teamActive ? ['team_runtime_inactive'] : []),
        ...decision.diagnostics,
        'status_snapshot_not_persisted',
      ],
      ...(source.providerId ? { providerId: source.providerId } : {}),
    };
  }
}
