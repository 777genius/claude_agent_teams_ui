import type {
  MemberWorkSyncReport,
  MemberWorkSyncReportRequest,
  MemberWorkSyncReportResult,
} from '../../contracts';
import { validateMemberWorkSyncReport } from '../domain';
import {
  attachMemberWorkSyncReportToken,
  finalizeMemberWorkSyncAgenda,
  MemberWorkSyncReconciler,
} from './MemberWorkSyncReconciler';
import type { MemberWorkSyncUseCaseDeps } from './ports';

export class MemberWorkSyncReporter {
  private readonly reconciler: MemberWorkSyncReconciler;

  constructor(private readonly deps: MemberWorkSyncUseCaseDeps) {
    this.reconciler = new MemberWorkSyncReconciler(deps);
  }

  async execute(request: MemberWorkSyncReportRequest): Promise<MemberWorkSyncReportResult> {
    const source = await this.deps.agendaSource.loadAgenda(request);
    const agenda = finalizeMemberWorkSyncAgenda(this.deps, source);
    const nowIso = this.deps.clock.now().toISOString();
    const teamActive = this.deps.lifecycle
      ? await this.deps.lifecycle.isTeamActive(agenda.teamName)
      : true;
    if (!teamActive) {
      const status = await this.reconciler.execute(request);
      return {
        accepted: false,
        code: 'team_runtime_inactive',
        message: 'Team runtime is not active. Restart the team before reporting work sync state.',
        status,
      };
    }
    const tokenValidation = this.deps.reportToken
      ? await this.deps.reportToken.verify({
          token: request.reportToken,
          teamName: agenda.teamName,
          memberName: agenda.memberName,
          agendaFingerprint: agenda.fingerprint,
          nowIso,
        })
      : ({ ok: false, reason: 'missing' } as const);
    const validation = validateMemberWorkSyncReport({
      request,
      agenda,
      nowIso,
      activeMemberNames: source.activeMemberNames,
      tokenValidation,
    });

    if (!validation.ok) {
      const status = await this.reconciler.execute(request);
      return {
        accepted: false,
        code: validation.code,
        message: validation.message,
        status,
      };
    }

    const report: MemberWorkSyncReport = {
      teamName: agenda.teamName,
      memberName: agenda.memberName,
      state: request.state,
      agendaFingerprint: agenda.fingerprint,
      reportedAt: nowIso,
      ...(validation.expiresAt ? { expiresAt: validation.expiresAt } : {}),
      ...(request.taskIds ? { taskIds: [...request.taskIds] } : {}),
      ...(request.note ? { note: request.note } : {}),
      source: request.source ?? 'app',
      accepted: true,
    };

    const status = await attachMemberWorkSyncReportToken(this.deps, {
      teamName: agenda.teamName,
      memberName: agenda.memberName,
      state:
        report.state === 'caught_up'
          ? ('caught_up' as const)
          : report.state === 'blocked'
            ? ('blocked' as const)
            : ('still_working' as const),
      agenda,
      report,
      shadow: {
        reconciledBy: 'report',
        wouldNudge: false,
        fingerprintChanged: false,
      },
      evaluatedAt: nowIso,
      diagnostics: [...agenda.diagnostics, 'report_accepted'],
      ...(source.providerId ? { providerId: source.providerId } : {}),
    });

    await this.deps.statusStore.write(status);
    return {
      accepted: true,
      code: 'accepted',
      message: validation.message,
      status,
    };
  }
}
