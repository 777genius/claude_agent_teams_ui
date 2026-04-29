import type { MemberWorkSyncClockPort, MemberWorkSyncLoggerPort } from './ports';
import type {
  RuntimeTurnSettledEventStorePort,
  RuntimeTurnSettledPayloadNormalizerPort,
  RuntimeTurnSettledReconcileQueuePort,
  RuntimeTurnSettledTargetResolverPort,
} from './RuntimeTurnSettledPorts';

export interface RuntimeTurnSettledIngestorDeps {
  eventStore: RuntimeTurnSettledEventStorePort;
  normalizer: RuntimeTurnSettledPayloadNormalizerPort;
  targetResolver: RuntimeTurnSettledTargetResolverPort;
  reconcileQueue: RuntimeTurnSettledReconcileQueuePort;
  clock: MemberWorkSyncClockPort;
  logger?: MemberWorkSyncLoggerPort;
}

export interface RuntimeTurnSettledDrainSummary {
  claimed: number;
  enqueued: number;
  unresolved: number;
  invalid: number;
  failed: number;
}

export class RuntimeTurnSettledIngestor {
  constructor(private readonly deps: RuntimeTurnSettledIngestorDeps) {}

  async drainPending(limit: number = 50): Promise<RuntimeTurnSettledDrainSummary> {
    const summary: RuntimeTurnSettledDrainSummary = {
      claimed: 0,
      enqueued: 0,
      unresolved: 0,
      invalid: 0,
      failed: 0,
    };

    const payloads = await this.deps.eventStore.claimPending(limit);
    summary.claimed = payloads.length;

    for (const payload of payloads) {
      const processedAt = this.deps.clock.now().toISOString();
      try {
        const normalized = this.deps.normalizer.normalize({
          provider: payload.provider,
          raw: payload.raw,
          recordedAt: payload.claimedAt,
        });

        if (!normalized.ok) {
          summary.invalid += 1;
          await this.deps.eventStore.markInvalid(payload, {
            reason: normalized.reason,
            processedAt,
          });
          continue;
        }

        const resolution = await this.deps.targetResolver.resolve(normalized.event);
        if (!resolution.ok) {
          summary.unresolved += 1;
          await this.deps.eventStore.markProcessed(payload, {
            event: normalized.event,
            outcome: 'unresolved',
            reason: resolution.reason,
            processedAt,
          });
          continue;
        }

        this.deps.reconcileQueue.enqueueRuntimeTurnSettled({
          teamName: resolution.teamName,
          memberName: resolution.memberName,
          event: normalized.event,
        });
        summary.enqueued += 1;
        await this.deps.eventStore.markProcessed(payload, {
          event: normalized.event,
          teamName: resolution.teamName,
          memberName: resolution.memberName,
          outcome: 'enqueued',
          processedAt,
        });
      } catch (error) {
        summary.failed += 1;
        this.deps.logger?.warn('runtime turn settled ingest failed', {
          filePath: payload.filePath,
          provider: payload.provider,
          error: String(error),
        });
      }
    }

    return summary;
  }
}
