import { appendMemberWorkSyncAudit, reasonToAuditEvent } from './MemberWorkSyncAudit';
import { decideMemberWorkSyncNudgeActivation } from './MemberWorkSyncNudgeActivationPolicy';
import { finalizeMemberWorkSyncAgenda } from './MemberWorkSyncReconciler';
import { decideMemberWorkSyncStatus } from '../domain';

import type { MemberWorkSyncOutboxItem, MemberWorkSyncStatus } from '../../contracts';
import type { MemberWorkSyncAuditEventName, MemberWorkSyncUseCaseDeps } from './ports';

const MEMBER_WORK_SYNC_MAX_NUDGES_PER_MEMBER_PER_HOUR = 2;
const MEMBER_WORK_SYNC_RETRY_BASE_MINUTES = 10;
const MEMBER_WORK_SYNC_RETRY_MAX_MINUTES = 60;

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

function subtractMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) - minutes * 60_000).toISOString();
}

function stableJitterMinutes(id: string, attemptGeneration: number): number {
  const seed = `${id}:${attemptGeneration}`;
  let value = 0;
  for (const char of seed) {
    value = (value * 31 + char.charCodeAt(0)) % 997;
  }
  return value % 5;
}

function nextRetryAt(item: MemberWorkSyncOutboxItem, nowIso: string): string {
  const exponentialMinutes =
    MEMBER_WORK_SYNC_RETRY_BASE_MINUTES * 2 ** Math.max(0, item.attemptGeneration - 1);
  const cappedMinutes = Math.min(MEMBER_WORK_SYNC_RETRY_MAX_MINUTES, exponentialMinutes);
  return addMinutes(nowIso, cappedMinutes + stableJitterMinutes(item.id, item.attemptGeneration));
}

export class MemberWorkSyncNudgeDispatcher {
  constructor(private readonly deps: MemberWorkSyncUseCaseDeps) {}

  async dispatchDue(
    options: MemberWorkSyncNudgeDispatchOptions
  ): Promise<MemberWorkSyncNudgeDispatchSummary> {
    const outbox = this.deps.outboxStore;
    const inbox = this.deps.inboxNudge;
    if (!outbox || !inbox) {
      return emptySummary();
    }

    const nowIso = this.deps.clock.now().toISOString();
    const summary = emptySummary();
    for (const teamName of [
      ...new Set(options.teamNames.map((name) => name.trim()).filter(Boolean)),
    ]) {
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
          nextAttemptAt: revalidation.nextAttemptAt ?? nextRetryAt(item, nowIso),
        });
        await this.appendDispatchAudit(
          item,
          reasonToAuditEvent(revalidation.reason),
          revalidation.reason
        );
        return 'retryable';
      }
      await outbox.markSuperseded({
        teamName: item.teamName,
        id: item.id,
        reason: revalidation.reason,
        nowIso,
      });
      await this.appendDispatchAudit(item, 'nudge_superseded', revalidation.reason);
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
        await this.appendDispatchAudit(item, 'nudge_skipped', 'inbox_payload_conflict');
        return 'terminal';
      }
      await outbox.markDelivered({
        teamName: item.teamName,
        id: item.id,
        attemptGeneration: item.attemptGeneration,
        deliveredMessageId: inserted.messageId,
        nowIso,
      });
      await this.appendDispatchAudit(item, 'nudge_delivered', 'inbox_inserted');
      await this.scheduleDeliveryWake(
        item,
        inserted.messageId,
        inserted.inserted,
        revalidation.providerId
      );
      return 'delivered';
    } catch (error) {
      await outbox.markFailed({
        teamName: item.teamName,
        id: item.id,
        attemptGeneration: item.attemptGeneration,
        error: String(error),
        retryable: true,
        nowIso,
        nextAttemptAt: nextRetryAt(item, nowIso),
      });
      await this.appendDispatchAudit(item, 'nudge_retryable', String(error));
      return 'retryable';
    }
  }

  private async appendDispatchAudit(
    item: MemberWorkSyncOutboxItem,
    event: MemberWorkSyncAuditEventName,
    reason: string
  ): Promise<void> {
    await appendMemberWorkSyncAudit(this.deps, {
      teamName: item.teamName,
      memberName: item.memberName,
      event,
      source: 'nudge_dispatcher',
      agendaFingerprint: item.agendaFingerprint,
      reason,
      taskRefs: item.payload.taskRefs,
      messagePreview: item.payload.text,
    });
  }

  private async revalidate(
    item: MemberWorkSyncOutboxItem,
    nowIso: string
  ): Promise<
    | { ok: true; providerId?: MemberWorkSyncStatus['providerId'] }
    | { ok: false; reason: string; retryable: boolean; nextAttemptAt?: string }
  > {
    const teamActive = this.deps.lifecycle
      ? await this.deps.lifecycle.isTeamActive(item.teamName)
      : true;
    if (!teamActive) {
      return { ok: false, reason: 'team_inactive', retryable: false };
    }

    const previous = await this.deps.statusStore.read({
      teamName: item.teamName,
      memberName: item.memberName,
    });
    if (!previous) {
      return { ok: false, reason: 'status_missing', retryable: false };
    }

    let source;
    try {
      source = await this.deps.agendaSource.loadAgenda({
        teamName: item.teamName,
        memberName: item.memberName,
      });
    } catch (error) {
      return { ok: false, reason: `agenda_revalidation_failed:${String(error)}`, retryable: true };
    }
    const agenda = finalizeMemberWorkSyncAgenda(this.deps, source);
    const decision = decideMemberWorkSyncStatus({
      agenda,
      latestAcceptedReport: previous.report?.accepted ? previous.report : null,
      nowIso,
      inactive: source.inactive || !teamActive,
    });
    const providerId = source.providerId ?? previous.providerId;
    const revalidatedStatus: MemberWorkSyncStatus = {
      ...previous,
      state: decision.state,
      agenda,
      ...(decision.acceptedReport ? { report: decision.acceptedReport } : {}),
      shadow: {
        ...previous.shadow,
        reconciledBy: previous.shadow?.reconciledBy ?? 'queue',
        wouldNudge: decision.state === 'needs_sync' && agenda.items.length > 0,
        fingerprintChanged:
          Boolean(previous.agenda.fingerprint) &&
          previous.agenda.fingerprint !== agenda.fingerprint,
      },
      evaluatedAt: nowIso,
      diagnostics: [...agenda.diagnostics, ...decision.diagnostics],
      ...(providerId ? { providerId } : {}),
    };
    if (
      decision.state !== 'needs_sync' ||
      agenda.items.length === 0 ||
      agenda.fingerprint !== item.agendaFingerprint
    ) {
      return { ok: false, reason: 'status_no_longer_matches_outbox', retryable: false };
    }

    if (!this.deps.statusStore.readTeamMetrics) {
      return { ok: false, reason: 'metrics_unavailable', retryable: true };
    }
    const metrics = await this.deps.statusStore.readTeamMetrics(item.teamName);
    const activation = decideMemberWorkSyncNudgeActivation({
      status: revalidatedStatus,
      metrics,
    });
    if (!activation.active) {
      return { ok: false, reason: 'phase2_not_ready', retryable: true };
    }

    const recentDelivered = await this.deps.outboxStore?.countRecentDelivered({
      teamName: item.teamName,
      memberName: item.memberName,
      sinceIso: subtractMinutes(nowIso, 60),
    });
    if (
      recentDelivered != null &&
      recentDelivered >= MEMBER_WORK_SYNC_MAX_NUDGES_PER_MEMBER_PER_HOUR
    ) {
      return {
        ok: false,
        reason: 'member_nudge_rate_limited',
        retryable: true,
        nextAttemptAt: addMinutes(nowIso, 60),
      };
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

    return { ok: true, ...(providerId ? { providerId } : {}) };
  }

  private async scheduleDeliveryWake(
    item: MemberWorkSyncOutboxItem,
    messageId: string,
    inserted: boolean,
    providerId?: MemberWorkSyncStatus['providerId']
  ): Promise<void> {
    if (!this.deps.nudgeDeliveryWake) {
      return;
    }

    try {
      await this.deps.nudgeDeliveryWake.schedule({
        teamName: item.teamName,
        memberName: item.memberName,
        messageId,
        ...(providerId ? { providerId } : {}),
        reason: inserted ? 'member_work_sync_nudge_inserted' : 'member_work_sync_nudge_existing',
        delayMs: 500,
      });
    } catch (error) {
      const reason = `nudge_wake_failed:${String(error)}`;
      await this.appendDispatchAudit(item, 'nudge_wake_failed', reason);
      this.deps.logger?.warn('member work sync nudge delivery wake failed', {
        teamName: item.teamName,
        memberName: item.memberName,
        messageId,
        error: String(error),
      });
    }
  }
}
