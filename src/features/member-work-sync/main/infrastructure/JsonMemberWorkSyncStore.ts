import { atomicWriteAsync } from '@main/utils/atomicWrite';
import { createHash } from 'crypto';
import { mkdir, readFile, rename } from 'fs/promises';

import { withFileLock } from '@main/services/team/fileLock';
import type {
  MemberWorkSyncMetricEvent,
  MemberWorkSyncOutboxClaimInput,
  MemberWorkSyncOutboxCountRecentDeliveredInput,
  MemberWorkSyncOutboxEnsureInput,
  MemberWorkSyncOutboxEnsureResult,
  MemberWorkSyncOutboxItem,
  MemberWorkSyncOutboxMarkDeliveredInput,
  MemberWorkSyncOutboxMarkFailedInput,
  MemberWorkSyncOutboxMarkSupersededInput,
  MemberWorkSyncReportIntent,
  MemberWorkSyncReportRequest,
  MemberWorkSyncStatus,
  MemberWorkSyncStatusState,
  MemberWorkSyncTeamMetrics,
} from '../../contracts';
import { assessMemberWorkSyncPhase2Readiness } from '../../core/domain';
import type {
  MemberWorkSyncOutboxStorePort,
  MemberWorkSyncReportStorePort,
  MemberWorkSyncStatusStorePort,
} from '../../core/application';
import type { MemberWorkSyncStorePaths } from './MemberWorkSyncStorePaths';

interface StoreFile {
  schemaVersion: 1;
  members: Record<string, MemberWorkSyncStatus>;
  metrics?: {
    recentEvents: MemberWorkSyncMetricEvent[];
  };
}

interface PendingReportFile {
  schemaVersion: 1;
  intents: Record<string, MemberWorkSyncReportIntent>;
}

interface OutboxFile {
  schemaVersion: 1;
  items: Record<string, MemberWorkSyncOutboxItem>;
}

function normalizeMemberKey(memberName: string): string {
  return memberName.trim().toLowerCase();
}

function isStoreFile(value: unknown): value is StoreFile {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as StoreFile).schemaVersion === 1 &&
    (value as StoreFile).members != null &&
    typeof (value as StoreFile).members === 'object' &&
    !Array.isArray((value as StoreFile).members)
  );
}

function emptyStateCounts(): Record<MemberWorkSyncStatusState, number> {
  return {
    caught_up: 0,
    needs_sync: 0,
    still_working: 0,
    blocked: 0,
    inactive: 0,
    unknown: 0,
  };
}

function isPendingReportFile(value: unknown): value is PendingReportFile {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as PendingReportFile).schemaVersion === 1 &&
    (value as PendingReportFile).intents != null &&
    typeof (value as PendingReportFile).intents === 'object' &&
    !Array.isArray((value as PendingReportFile).intents)
  );
}

function isOutboxFile(value: unknown): value is OutboxFile {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as OutboxFile).schemaVersion === 1 &&
    (value as OutboxFile).items != null &&
    typeof (value as OutboxFile).items === 'object' &&
    !Array.isArray((value as OutboxFile).items)
  );
}

function isOutboxTerminal(status: MemberWorkSyncOutboxItem['status']): boolean {
  return status === 'delivered' || status === 'superseded' || status === 'failed_terminal';
}

function canClaimOutboxItem(item: MemberWorkSyncOutboxItem, nowIso: string): boolean {
  if (item.status !== 'pending' && item.status !== 'failed_retryable') {
    return false;
  }
  if (!item.nextAttemptAt) {
    return true;
  }
  return item.nextAttemptAt <= nowIso;
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function buildPendingReportIntentId(request: MemberWorkSyncReportRequest): string {
  const taskIds = [...new Set(request.taskIds ?? [])].sort();
  const payload = {
    teamName: request.teamName,
    memberName: normalizeMemberKey(request.memberName),
    state: request.state,
    agendaFingerprint: request.agendaFingerprint,
    reportToken: request.reportToken ?? '',
    ...(taskIds.length > 0 ? { taskIds } : {}),
    ...(request.note ? { note: request.note } : {}),
    ...(request.leaseTtlMs ? { leaseTtlMs: request.leaseTtlMs } : {}),
    ...(request.source ? { source: request.source } : {}),
  };
  return `member-work-sync-intent:${createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')}`;
}

function buildMetricEventId(status: MemberWorkSyncStatus, kind: MemberWorkSyncMetricEvent['kind']) {
  return `member-work-sync-metric:${createHash('sha256')
    .update(
      stableStringify({
        teamName: status.teamName,
        memberName: normalizeMemberKey(status.memberName),
        kind,
        state: status.state,
        agendaFingerprint: status.agenda.fingerprint,
        evaluatedAt: status.evaluatedAt,
        reportState: status.report?.state ?? '',
        rejectionCode: status.report?.rejectionCode ?? '',
      })
    )
    .digest('hex')}`;
}

function buildMetricEvents(status: MemberWorkSyncStatus): MemberWorkSyncMetricEvent[] {
  const base = {
    teamName: status.teamName,
    memberName: status.memberName,
    state: status.state,
    agendaFingerprint: status.agenda.fingerprint,
    recordedAt: status.evaluatedAt,
    actionableCount: status.agenda.items.length,
    ...(status.providerId ? { providerId: status.providerId } : {}),
    ...(status.shadow?.previousFingerprint
      ? { previousFingerprint: status.shadow.previousFingerprint }
      : {}),
    ...(status.shadow?.triggerReasons?.length
      ? { triggerReasons: [...status.shadow.triggerReasons] }
      : {}),
    ...(status.report?.state ? { reportState: status.report.state } : {}),
    ...(status.report?.rejectionCode ? { rejectionCode: status.report.rejectionCode } : {}),
  };
  const events: MemberWorkSyncMetricEvent[] = [
    {
      ...base,
      id: buildMetricEventId(status, 'status_evaluated'),
      kind: 'status_evaluated',
    },
  ];
  if (status.shadow?.wouldNudge) {
    events.push({
      ...base,
      id: buildMetricEventId(status, 'would_nudge'),
      kind: 'would_nudge',
    });
  }
  if (status.shadow?.fingerprintChanged) {
    events.push({
      ...base,
      id: buildMetricEventId(status, 'fingerprint_changed'),
      kind: 'fingerprint_changed',
    });
  }
  if (status.report?.accepted) {
    events.push({
      ...base,
      id: buildMetricEventId(status, 'report_accepted'),
      kind: 'report_accepted',
    });
  } else if (status.report?.rejectionCode) {
    events.push({
      ...base,
      id: buildMetricEventId(status, 'report_rejected'),
      kind: 'report_rejected',
    });
  }
  return events;
}

function appendMetricEvents(file: StoreFile, status: MemberWorkSyncStatus): void {
  const current = file.metrics?.recentEvents ?? [];
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of buildMetricEvents(status)) {
    byId.set(event.id, event);
  }
  file.metrics = {
    recentEvents: [...byId.values()]
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
      .slice(-200),
  };
}

async function quarantineFile(filePath: string): Promise<void> {
  try {
    await rename(filePath, `${filePath}.invalid.${Date.now()}`);
  } catch {
    // If quarantine fails, keep the feature degraded but do not block team operation.
  }
}

export class JsonMemberWorkSyncStore
  implements
    MemberWorkSyncStatusStorePort,
    MemberWorkSyncReportStorePort,
    MemberWorkSyncOutboxStorePort
{
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(private readonly paths: MemberWorkSyncStorePaths) {}

  async read(input: {
    teamName: string;
    memberName: string;
  }): Promise<MemberWorkSyncStatus | null> {
    const file = await this.readFile(input.teamName);
    return file.members[normalizeMemberKey(input.memberName)] ?? null;
  }

  async write(status: MemberWorkSyncStatus): Promise<void> {
    await this.enqueue(status.teamName, async () => {
      await withFileLock(this.paths.getStatusPath(status.teamName), async () => {
        const existing = await this.readFile(status.teamName);
        existing.members[normalizeMemberKey(status.memberName)] = status;
        appendMetricEvents(existing, status);
        await mkdir(this.paths.getTeamDir(status.teamName), { recursive: true });
        await atomicWriteAsync(
          this.paths.getStatusPath(status.teamName),
          JSON.stringify(existing, null, 2)
        );
      });
    });
  }

  async readTeamMetrics(teamName: string): Promise<MemberWorkSyncTeamMetrics> {
    const file = await this.readFile(teamName);
    const stateCounts = emptyStateCounts();
    const members = Object.values(file.members);
    let actionableItemCount = 0;
    for (const status of members) {
      stateCounts[status.state] += 1;
      actionableItemCount += status.agenda.items.length;
    }
    const recentEvents = [...(file.metrics?.recentEvents ?? [])].sort((left, right) =>
      left.recordedAt.localeCompare(right.recordedAt)
    );
    const metrics = {
      teamName,
      generatedAt: new Date().toISOString(),
      memberCount: members.length,
      stateCounts,
      actionableItemCount,
      wouldNudgeCount: recentEvents.filter((event) => event.kind === 'would_nudge').length,
      fingerprintChangeCount: recentEvents.filter(
        (event) => event.kind === 'fingerprint_changed'
      ).length,
      reportAcceptedCount: recentEvents.filter((event) => event.kind === 'report_accepted')
        .length,
      reportRejectedCount: recentEvents.filter((event) => event.kind === 'report_rejected')
        .length,
      recentEvents,
    };
    return {
      ...metrics,
      phase2Readiness: assessMemberWorkSyncPhase2Readiness({
        memberCount: metrics.memberCount,
        recentEvents: metrics.recentEvents,
      }),
    };
  }

  async appendPendingReport(request: MemberWorkSyncReportRequest, reason: string): Promise<void> {
    const id = buildPendingReportIntentId(request);
    await this.enqueue(request.teamName, async () => {
      await withFileLock(this.paths.getPendingReportsPath(request.teamName), async () => {
        const existing = await this.readPendingFile(request.teamName);
        const current = existing.intents[id];
        if (current && current.status !== 'pending') {
          return;
        }
        existing.intents[id] = {
          id,
          teamName: request.teamName,
          memberName: request.memberName,
          request,
          reason: current?.reason ?? reason,
          status: 'pending',
          recordedAt: current?.recordedAt ?? new Date().toISOString(),
        };
        await this.writePendingFile(request.teamName, existing);
      });
    });
  }

  async listPendingReports(teamName: string): Promise<MemberWorkSyncReportIntent[]> {
    const file = await this.readPendingFile(teamName);
    return Object.values(file.intents)
      .filter((intent) => intent.status === 'pending')
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  async markPendingReportProcessed(
    teamName: string,
    id: string,
    result: {
      status: MemberWorkSyncReportIntent['status'];
      resultCode: string;
      processedAt: string;
    }
  ): Promise<void> {
    await this.enqueue(teamName, async () => {
      await withFileLock(this.paths.getPendingReportsPath(teamName), async () => {
        const existing = await this.readPendingFile(teamName);
        const current = existing.intents[id];
        if (!current || current.status !== 'pending') {
          return;
        }
        existing.intents[id] = {
          ...current,
          status: result.status,
          resultCode: result.resultCode,
          processedAt: result.processedAt,
        };
        await this.writePendingFile(teamName, existing);
      });
    });
  }

  async ensurePending(
    input: MemberWorkSyncOutboxEnsureInput
  ): Promise<MemberWorkSyncOutboxEnsureResult> {
    let result: MemberWorkSyncOutboxEnsureResult | null = null;
    await this.enqueue(input.teamName, async () => {
      await withFileLock(this.paths.getOutboxPath(input.teamName), async () => {
        const existing = await this.readOutboxFile(input.teamName);
        const current = existing.items[input.id];
        if (current) {
          if (current.payloadHash !== input.payloadHash) {
            result = {
              ok: false,
              outcome: 'payload_conflict',
              item: current,
              existingPayloadHash: current.payloadHash,
              requestedPayloadHash: input.payloadHash,
            };
            return;
          }

          if (!isOutboxTerminal(current.status) && current.status !== 'pending') {
            const next: MemberWorkSyncOutboxItem = {
              ...current,
              status: 'pending',
              updatedAt: input.nowIso,
            };
            const nextAttemptAt = input.nextAttemptAt ?? current.nextAttemptAt;
            if (nextAttemptAt) {
              next.nextAttemptAt = nextAttemptAt;
            } else {
              delete next.nextAttemptAt;
            }
            delete next.claimedBy;
            delete next.claimedAt;
            delete next.lastError;
            existing.items[input.id] = next;
            await this.writeOutboxFile(input.teamName, existing);
            result = { ok: true, outcome: 'existing', item: existing.items[input.id] };
            return;
          }

          result = { ok: true, outcome: 'existing', item: current };
          return;
        }

        const item: MemberWorkSyncOutboxItem = {
          id: input.id,
          teamName: input.teamName,
          memberName: input.memberName,
          agendaFingerprint: input.agendaFingerprint,
          payloadHash: input.payloadHash,
          payload: input.payload,
          status: 'pending',
          attemptGeneration: 0,
          ...(input.nextAttemptAt ? { nextAttemptAt: input.nextAttemptAt } : {}),
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        };
        existing.items[input.id] = item;
        await this.writeOutboxFile(input.teamName, existing);
        result = { ok: true, outcome: 'created', item };
      });
    });

    if (!result) {
      throw new Error('Member work sync outbox write did not produce a result');
    }
    return result;
  }

  async claimDue(input: MemberWorkSyncOutboxClaimInput): Promise<MemberWorkSyncOutboxItem[]> {
    const claimed: MemberWorkSyncOutboxItem[] = [];
    await this.enqueue(input.teamName, async () => {
      await withFileLock(this.paths.getOutboxPath(input.teamName), async () => {
        const existing = await this.readOutboxFile(input.teamName);
        const due = Object.values(existing.items)
          .filter((item) => canClaimOutboxItem(item, input.nowIso))
          .sort((left, right) => {
            const leftTime = left.nextAttemptAt ?? left.updatedAt;
            const rightTime = right.nextAttemptAt ?? right.updatedAt;
            return leftTime.localeCompare(rightTime);
          })
          .slice(0, Math.max(0, input.limit));

        for (const item of due) {
          const next: MemberWorkSyncOutboxItem = {
            ...item,
            status: 'claimed',
            attemptGeneration: item.attemptGeneration + 1,
            claimedBy: input.claimedBy,
            claimedAt: input.nowIso,
            updatedAt: input.nowIso,
          };
          delete next.lastError;
          existing.items[item.id] = next;
          claimed.push(next);
        }

        if (due.length > 0) {
          await this.writeOutboxFile(input.teamName, existing);
        }
      });
    });
    return claimed;
  }

  async markDelivered(input: MemberWorkSyncOutboxMarkDeliveredInput): Promise<void> {
    await this.updateOutboxItem(input.teamName, input.id, (current) => {
      if (!current || current.attemptGeneration !== input.attemptGeneration) {
        return current;
      }
      const next: MemberWorkSyncOutboxItem = {
        ...current,
        status: 'delivered',
        deliveredMessageId: input.deliveredMessageId,
        updatedAt: input.nowIso,
      };
      delete next.lastError;
      return next;
    });
  }

  async markSuperseded(input: MemberWorkSyncOutboxMarkSupersededInput): Promise<void> {
    await this.updateOutboxItem(input.teamName, input.id, (current) => {
      if (!current || isOutboxTerminal(current.status)) {
        return current;
      }
      return {
        ...current,
        status: 'superseded',
        lastError: input.reason,
        updatedAt: input.nowIso,
      };
    });
  }

  async markFailed(input: MemberWorkSyncOutboxMarkFailedInput): Promise<void> {
    await this.updateOutboxItem(input.teamName, input.id, (current) => {
      if (!current || current.attemptGeneration !== input.attemptGeneration) {
        return current;
      }
      const next: MemberWorkSyncOutboxItem = {
        ...current,
        status: input.retryable ? 'failed_retryable' : 'failed_terminal',
        lastError: input.error,
        ...(input.retryable && input.nextAttemptAt ? { nextAttemptAt: input.nextAttemptAt } : {}),
        updatedAt: input.nowIso,
      };
      if (!input.retryable) {
        delete next.nextAttemptAt;
      }
      return next;
    });
  }

  async countRecentDelivered(
    input: MemberWorkSyncOutboxCountRecentDeliveredInput
  ): Promise<number> {
    const file = await this.readOutboxFile(input.teamName);
    return Object.values(file.items).filter(
      (item) =>
        item.memberName.trim().toLowerCase() === input.memberName.trim().toLowerCase() &&
        item.status === 'delivered' &&
        item.updatedAt >= input.sinceIso
    ).length;
  }

  private async readFile(teamName: string): Promise<StoreFile> {
    const filePath = this.paths.getStatusPath(teamName);
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (isStoreFile(parsed)) {
        return parsed;
      }
      await quarantineFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await quarantineFile(filePath);
      }
    }
    return { schemaVersion: 1, members: {}, metrics: { recentEvents: [] } };
  }

  private async readPendingFile(teamName: string): Promise<PendingReportFile> {
    const filePath = this.paths.getPendingReportsPath(teamName);
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (isPendingReportFile(parsed)) {
        return parsed;
      }
      await quarantineFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await quarantineFile(filePath);
      }
    }
    return { schemaVersion: 1, intents: {} };
  }

  private async readOutboxFile(teamName: string): Promise<OutboxFile> {
    const filePath = this.paths.getOutboxPath(teamName);
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (isOutboxFile(parsed)) {
        return parsed;
      }
      await quarantineFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await quarantineFile(filePath);
      }
    }
    return { schemaVersion: 1, items: {} };
  }

  private async writeOutboxFile(teamName: string, file: OutboxFile): Promise<void> {
    await mkdir(this.paths.getTeamDir(teamName), { recursive: true });
    await atomicWriteAsync(this.paths.getOutboxPath(teamName), JSON.stringify(file, null, 2));
  }

  private async updateOutboxItem(
    teamName: string,
    id: string,
    updater: (
      current: MemberWorkSyncOutboxItem | undefined
    ) => MemberWorkSyncOutboxItem | undefined
  ): Promise<void> {
    await this.enqueue(teamName, async () => {
      await withFileLock(this.paths.getOutboxPath(teamName), async () => {
        const existing = await this.readOutboxFile(teamName);
        const next = updater(existing.items[id]);
        if (!next) {
          return;
        }
        existing.items[id] = next;
        await this.writeOutboxFile(teamName, existing);
      });
    });
  }

  private async writePendingFile(teamName: string, file: PendingReportFile): Promise<void> {
    await mkdir(this.paths.getTeamDir(teamName), { recursive: true });
    await atomicWriteAsync(
      this.paths.getPendingReportsPath(teamName),
      JSON.stringify(file, null, 2)
    );
  }

  private async enqueue(teamName: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.writeQueues.get(teamName) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.writeQueues.set(
      teamName,
      next.finally(() => {
        if (this.writeQueues.get(teamName) === next) {
          this.writeQueues.delete(teamName);
        }
      })
    );
    await next;
  }
}
