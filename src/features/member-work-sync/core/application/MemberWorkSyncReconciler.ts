import {
  buildAgendaFingerprintPayload,
  canonicalizeAgendaFingerprintPayload,
  decideMemberWorkSyncStatus,
  formatAgendaFingerprint,
} from '../domain';
import type { MemberWorkSyncStatus, MemberWorkSyncStatusRequest } from '../../contracts';
import type { MemberWorkSyncAgendaSourceResult, MemberWorkSyncUseCaseDeps } from './ports';

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

  async execute(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus> {
    const source = await this.deps.agendaSource.loadAgenda(request);
    const agenda = finalizeMemberWorkSyncAgenda(this.deps, source);
    const previous = await this.deps.statusStore.read(request);
    const nowIso = this.deps.clock.now().toISOString();
    const decision = decideMemberWorkSyncStatus({
      agenda,
      latestAcceptedReport: previous?.report?.accepted ? previous.report : null,
      nowIso,
      inactive: source.inactive,
    });

    const status: MemberWorkSyncStatus = {
      teamName: agenda.teamName,
      memberName: agenda.memberName,
      state: decision.state,
      agenda,
      ...(decision.acceptedReport ? { report: decision.acceptedReport } : {}),
      evaluatedAt: nowIso,
      diagnostics: [...agenda.diagnostics, ...decision.diagnostics],
      ...(source.providerId ? { providerId: source.providerId } : {}),
    };

    await this.deps.statusStore.write(status);
    return status;
  }
}
