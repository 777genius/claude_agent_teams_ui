import type { MemberWorkSyncOutboxItem } from '../../contracts';
import type { MemberWorkSyncUseCaseDeps } from './ports';

export interface MemberWorkSyncNudgeDispatchSummary {
  claimed: number;
  delivered: number;
  superseded: number;
  retryable: number;
  terminal: number;
}

export interface MemberWorkSyncNudgeDispatchOptions {
  claimedBy: string;
  teamNames: string[];
  limit?: number;
}

function emptySummary(): MemberWorkSyncNudgeDispatchSummary {
  return { claimed: 0, delivered: 0, superseded: 0, retryable: 0, terminal: 0 };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

export class MemberWorkSyncNudgeDispatcher {
  constructor(private readonly deps: MemberWorkSyncUseCaseDeps) {}

  async dispatchDue(options: MemberWorkSyncNudgeDispatchOptions): Promise<MemberWorkSyncNudgeDispatchSummary> {
    const outbox = this.deps.outboxStore;
    const inbox = this.deps.inboxNudge;
    if (!outbox || !inbox) {
      return emptySummary();
    }

    const nowIso = this.deps.clock.now().toISOString();
    const summary = emptySummary();
    for (const teamName of [...new Set(options.teamNames.map((name) => name.trim()).filter(Boolean))]) {
      const claimed = await outbox.claimDue({
        teamName,
        claimedBy: options.claimedBy,
        nowIso,
        limit: options.limit ?? 10,
      });
      summary.claimed += claimed.length;
      for (const item of claimed) {
        const result = await this.dispatchItem(item, nowIso);
        summary[result] += 1;
      }
    }
    return summary;
  }

  private async dispatchItem(
    item: MemberWorkSyncOutboxItem,
    nowIso: string
  ): Promise<keyof Omit<MemberWorkSyncNudgeDispatchSummary, 'claimed'>> {
    const outbox = this.deps.outboxStore;
    const inbox = this.deps.inboxNudge;
    if (!outbox || !inbox) {
      return 'terminal';
    }

    const revalidation = await this.revalidate(item, nowIso);
    if (!revalidation.ok) {
      if (revalidation.retryable) {
        await outbox.markFailed({
          teamName: item.teamName,
          id: item.id,
          attemptGeneration: item.attemptGeneration,
          error: revalidation.reason,
          retryable: true,
          nowIso,
          nextAttemptAt: revalidation.nextAttemptAt ?? addMinutes(nowIso, 10),
        });
        return 'retryable';
      }
      await outbox.markSuperseded({
        teamName: item.teamName,
        id: item.id,
        reason: revalidation.reason,
        nowIso,
      });
      return 'superseded';
    }

    try {
      const inserted = await inbox.insertIfAbsent({
        teamName: item.teamName,
        memberName: item.memberName,
        messageId: item.id,
        payloadHash: item.payloadHash,
        payload: item.payload,
        timestamp: nowIso,
      });
      if (inserted.conflict) {
        await outbox.markFailed({
          teamName: item.teamName,
          id: item.id,
          attemptGeneration: item.attemptGeneration,
          error: 'inbox_payload_conflict',
          retryable: false,
          nowIso,
        });
        return 'terminal';
      }
      await outbox.markDelivered({
        teamName: item.teamName,
        id: item.id,
        attemptGeneration: item.attemptGeneration,
        deliveredMessageId: inserted.messageId,
        nowIso,
      });
      return 'delivered';
    } catch (error) {
      await outbox.markFailed({
        teamName: item.teamName,
        id: item.id,
        attemptGeneration: item.attemptGeneration,
        error: String(error),
        retryable: true,
        nowIso,
        nextAttemptAt: addMinutes(nowIso, 10),
      });
      return 'retryable';
    }
  }

  private async revalidate(
    item: MemberWorkSyncOutboxItem,
    nowIso: string
  ): Promise<
    | { ok: true }
    | { ok: false; reason: string; retryable: boolean; nextAttemptAt?: string }
  > {
    if (this.deps.lifecycle && !(await this.deps.lifecycle.isTeamActive(item.teamName))) {
      return { ok: false, reason: 'team_inactive', retryable: false };
    }

    const status = await this.deps.statusStore.read({
      teamName: item.teamName,
      memberName: item.memberName,
    });
    if (!status) {
      return { ok: false, reason: 'status_missing', retryable: false };
    }
    if (
      status.state !== 'needs_sync' ||
      status.shadow?.wouldNudge !== true ||
      status.agenda.fingerprint !== item.agendaFingerprint
    ) {
      return { ok: false, reason: 'status_no_longer_matches_outbox', retryable: false };
    }

    if (!this.deps.statusStore.readTeamMetrics) {
      return { ok: false, reason: 'metrics_unavailable', retryable: true };
    }
    const metrics = await this.deps.statusStore.readTeamMetrics(item.teamName);
    if (metrics.phase2Readiness.state !== 'shadow_ready') {
      return { ok: false, reason: 'phase2_not_ready', retryable: true };
    }

    const busy = await this.deps.busySignal?.isBusy({
      teamName: item.teamName,
      memberName: item.memberName,
      nowIso,
    });
    if (busy?.busy) {
      return {
        ok: false,
        reason: `member_busy:${busy.reason ?? 'unknown'}`,
        retryable: true,
        nextAttemptAt: busy.retryAfterIso,
      };
    }

    const taskIds = item.payload.taskRefs.map((taskRef) => taskRef.taskId);
    if (
      this.deps.watchdogCooldown &&
      (await this.deps.watchdogCooldown.hasRecentNudge({
        teamName: item.teamName,
        memberName: item.memberName,
        taskIds,
        nowIso,
      }))
    ) {
      return { ok: false, reason: 'watchdog_cooldown_active', retryable: true };
    }

    return { ok: true };
  }
}
