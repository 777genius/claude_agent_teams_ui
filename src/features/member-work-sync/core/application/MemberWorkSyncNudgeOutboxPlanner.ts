import { buildMemberWorkSyncOutboxEnsureInput } from '../domain';

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
    if (metrics.phase2Readiness.state !== 'shadow_ready') {
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
      return { planned: false, code: 'payload_conflict' };
    }

    return { planned: true, code: result.outcome };
  }
}
