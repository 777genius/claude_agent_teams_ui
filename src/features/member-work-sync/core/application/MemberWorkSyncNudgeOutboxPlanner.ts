import { buildMemberWorkSyncOutboxEnsureInput } from '../domain';

import { appendMemberWorkSyncAudit } from './MemberWorkSyncAudit';
import { decideMemberWorkSyncNudgeActivation } from './MemberWorkSyncNudgeActivationPolicy';

import type { MemberWorkSyncStatus } from '../../contracts';
import type { MemberWorkSyncUseCaseDeps } from './ports';

export interface MemberWorkSyncNudgeOutboxPlanResult {
  planned: boolean;
  code:
    | 'outbox_unavailable'
    | 'metrics_unavailable'
    | 'status_not_nudgeable'
    | 'phase2_not_ready'
    | 'created'
    | 'existing'
    | 'payload_conflict';
}

export class MemberWorkSyncNudgeOutboxPlanner {
  constructor(private readonly deps: MemberWorkSyncUseCaseDeps) {}

  async plan(status: MemberWorkSyncStatus): Promise<MemberWorkSyncNudgeOutboxPlanResult> {
    if (!this.deps.outboxStore) {
      return { planned: false, code: 'outbox_unavailable' };
    }
    if (!this.deps.statusStore.readTeamMetrics) {
      return { planned: false, code: 'metrics_unavailable' };
    }

    const input = buildMemberWorkSyncOutboxEnsureInput({
      status,
      hash: this.deps.hash,
      nowIso: status.evaluatedAt,
    });
    if (!input) {
      return { planned: false, code: 'status_not_nudgeable' };
    }

    const metrics = await this.deps.statusStore.readTeamMetrics(status.teamName);
    const activation = decideMemberWorkSyncNudgeActivation({ status, metrics });
    if (!activation.active) {
      await this.appendPlanAudit(status, { planned: false, code: 'phase2_not_ready' });
      return { planned: false, code: 'phase2_not_ready' };
    }

    const result = await this.deps.outboxStore.ensurePending(input);
    if (!result.ok) {
      this.deps.logger?.warn('member work sync nudge outbox payload conflict', {
        teamName: status.teamName,
        memberName: status.memberName,
        outboxId: input.id,
        existingPayloadHash: result.existingPayloadHash,
        requestedPayloadHash: result.requestedPayloadHash,
      });
      await this.appendPlanAudit(status, { planned: false, code: 'payload_conflict' });
      return { planned: false, code: 'payload_conflict' };
    }

    const planResult = { planned: true, code: result.outcome } as const;
    await this.appendPlanAudit(status, planResult);
    return planResult;
  }

  private async appendPlanAudit(
    status: MemberWorkSyncStatus,
    result: MemberWorkSyncNudgeOutboxPlanResult
  ): Promise<void> {
    await appendMemberWorkSyncAudit(this.deps, {
      teamName: status.teamName,
      memberName: status.memberName,
      event: result.planned ? 'nudge_planned' : 'nudge_skipped',
      source: 'nudge_planner',
      agendaFingerprint: status.agenda.fingerprint,
      state: status.state,
      actionableCount: status.agenda.items.length,
      reason: result.code,
      ...(status.providerId ? { providerId: status.providerId } : {}),
      taskRefs: status.agenda.items.map((item) => ({
        taskId: item.taskId,
        displayId: item.displayId,
        teamName: status.teamName,
      })),
    });
  }
}
