import {
  buildAgendaFingerprintPayload,
  canonicalizeAgendaFingerprintPayload,
  decideMemberWorkSyncStatus,
  formatAgendaFingerprint,
} from '../domain';
import type { MemberWorkSyncStatus, MemberWorkSyncStatusRequest } from '../../contracts';
import type { MemberWorkSyncAgendaSourceResult, MemberWorkSyncUseCaseDeps } from './ports';

export interface MemberWorkSyncReconcileContext {
  reconciledBy?: 'request' | 'queue';
  triggerReasons?: string[];
}

export function finalizeMemberWorkSyncAgenda(
  deps: MemberWorkSyncUseCaseDeps,
  source: MemberWorkSyncAgendaSourceResult
) {
  const payload = buildAgendaFingerprintPayload({
    teamName: source.agenda.teamName,
    memberName: source.agenda.memberName,
    items: source.agenda.items,
    sourceRevision: source.agenda.sourceRevision,
  });
  const fingerprint = formatAgendaFingerprint(
    deps.hash.sha256Hex(canonicalizeAgendaFingerprintPayload(payload))
  );
  return {
    ...source.agenda,
    fingerprint,
    diagnostics: [...source.agenda.diagnostics, ...source.diagnostics],
  };
}

export class MemberWorkSyncReconciler {
  constructor(private readonly deps: MemberWorkSyncUseCaseDeps) {}

  async execute(
    request: MemberWorkSyncStatusRequest,
    context: MemberWorkSyncReconcileContext = {}
  ): Promise<MemberWorkSyncStatus> {
    const source = await this.deps.agendaSource.loadAgenda(request);
    const agenda = finalizeMemberWorkSyncAgenda(this.deps, source);
    const previous = await this.deps.statusStore.read(request);
    const nowIso = this.deps.clock.now().toISOString();
    const teamActive = this.deps.lifecycle
      ? await this.deps.lifecycle.isTeamActive(agenda.teamName)
      : true;
    const decision = decideMemberWorkSyncStatus({
      agenda,
      latestAcceptedReport: previous?.report?.accepted ? previous.report : null,
      nowIso,
      inactive: source.inactive || !teamActive,
    });

    const status = await attachMemberWorkSyncReportToken(this.deps, {
      teamName: agenda.teamName,
      memberName: agenda.memberName,
      state: decision.state,
      agenda,
      ...(decision.acceptedReport ? { report: decision.acceptedReport } : {}),
      shadow: {
        reconciledBy: context.reconciledBy ?? 'request',
        wouldNudge: decision.state === 'needs_sync' && agenda.items.length > 0,
        fingerprintChanged:
          Boolean(previous?.agenda.fingerprint) &&
          previous?.agenda.fingerprint !== agenda.fingerprint,
        ...(previous?.agenda.fingerprint
          ? { previousFingerprint: previous.agenda.fingerprint }
          : {}),
        ...(context.triggerReasons?.length
          ? { triggerReasons: [...new Set(context.triggerReasons)].sort() }
          : {}),
      },
      evaluatedAt: nowIso,
      diagnostics: [
        ...agenda.diagnostics,
        ...(!teamActive ? ['team_runtime_inactive'] : []),
        ...decision.diagnostics,
      ],
      ...(source.providerId ? { providerId: source.providerId } : {}),
    });

    await this.deps.statusStore.write(status);
    return status;
  }
}

export async function attachMemberWorkSyncReportToken(
  deps: MemberWorkSyncUseCaseDeps,
  status: MemberWorkSyncStatus
): Promise<MemberWorkSyncStatus> {
  if (!deps.reportToken) {
    return status;
  }

  const issued = await deps.reportToken.create({
    teamName: status.teamName,
    memberName: status.memberName,
    agendaFingerprint: status.agenda.fingerprint,
    issuedAt: status.evaluatedAt,
  });

  return {
    ...status,
    reportToken: issued.token,
    reportTokenExpiresAt: issued.expiresAt,
    diagnostics: [...status.diagnostics, 'report_token_issued'],
  };
}
