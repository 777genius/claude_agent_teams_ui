import type { MemberWorkSyncClockPort, MemberWorkSyncLoggerPort } from './ports';
import type { RuntimeTurnSettledEvent } from '../domain';
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
  ignored: number;
  invalid: number;
  failed: number;
}

const NON_TERMINAL_OPENCODE_OUTCOMES = new Set([
  'timeout',
  'stream_unavailable',
  'prompt_rejected',
  'idle_without_assistant_activity',
  'unknown',
]);

function getIgnoredReason(event: RuntimeTurnSettledEvent): string | null {
  if (event.provider !== 'opencode') {
    return null;
  }
  const outcome = event.outcome?.trim();
  if (!outcome || !NON_TERMINAL_OPENCODE_OUTCOMES.has(outcome)) {
    return null;
  }
  return `opencode_non_terminal_outcome:${outcome}`;
}

export class RuntimeTurnSettledIngestor {
  constructor(private readonly deps: RuntimeTurnSettledIngestorDeps) {}

  async drainPending(limit: number = 50): Promise<RuntimeTurnSettledDrainSummary> {
    const summary: RuntimeTurnSettledDrainSummary = {
      claimed: 0,
      enqueued: 0,
      unresolved: 0,
      ignored: 0,
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

        const ignoredReason = getIgnoredReason(normalized.event);
        if (ignoredReason) {
          summary.ignored += 1;
          await this.deps.eventStore.markProcessed(payload, {
            event: normalized.event,
            outcome: 'ignored',
            reason: ignoredReason,
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
