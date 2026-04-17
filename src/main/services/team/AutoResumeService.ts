import { createLogger } from '@shared/utils/logger';
import { parseRateLimitResetTime } from '@shared/utils/rateLimitDetector';

import { ConfigManager } from '../infrastructure/ConfigManager';

import type { TeamProvisioningService } from './TeamProvisioningService';

const logger = createLogger('Service:AutoResume');

const AUTO_RESUME_BUFFER_MS = 30 * 1000;
const AUTO_RESUME_MAX_DELAY_MS = 12 * 60 * 60 * 1000;
const AUTO_RESUME_HISTORY_FRESH_MS = 5 * 1000;
const AUTO_RESUME_MESSAGE =
  'Your rate limit has reset. Please resume the work you were doing before the limit was hit.';

interface PendingAutoResumeEntry {
  timer: NodeJS.Timeout;
  fireAtMs: number;
  sourceMessageAtMs: number;
  sourceRunId: string | null;
}

type AutoResumeProvisioning = Pick<
  TeamProvisioningService,
  'getCurrentRunId' | 'isTeamAlive' | 'sendMessageToTeam'
>;
type AutoResumeConfigReader = Pick<ConfigManager, 'getConfig'>;

export class AutoResumeService {
  private readonly pendingTimers = new Map<string, PendingAutoResumeEntry>();

  constructor(
    private readonly provisioningService: AutoResumeProvisioning,
    private readonly configManager: AutoResumeConfigReader = ConfigManager.getInstance()
  ) {}

  handleRateLimitMessage(
    teamName: string,
    messageText: string,
    observedAt: Date = new Date(),
    messageTimestamp: Date = observedAt
  ): void {
    const cfg = this.configManager.getConfig();
    if (!cfg.notifications.autoResumeOnRateLimit) return;

    const observedAtMs = observedAt.getTime();
    const messageAtMs = Number.isFinite(messageTimestamp.getTime())
      ? messageTimestamp.getTime()
      : observedAtMs;
    const parseReferenceTime = Number.isFinite(messageTimestamp.getTime())
      ? messageTimestamp
      : observedAt;

    const resetTime = parseRateLimitResetTime(messageText, parseReferenceTime);
    if (!resetTime) {
      logger.info(
        `[auto-resume] Rate limit detected for "${teamName}" but reset time was not parseable - skipping auto-resume`
      );
      return;
    }

    const resetAtMs = resetTime.getTime();
    const rawDelayMs = resetAtMs - observedAtMs;
    const targetFireAtMs = resetAtMs + AUTO_RESUME_BUFFER_MS;
    const messageAgeMs = Math.max(0, observedAtMs - messageAtMs);
    const existing = this.pendingTimers.get(teamName);
    const sourceRunId = this.provisioningService.getCurrentRunId(teamName);

    if (existing && messageAtMs < existing.sourceMessageAtMs) {
      logger.info(
        `[auto-resume] Ignoring older rate-limit message for "${teamName}" because a newer timer is already pending`
      );
      return;
    }

    if (targetFireAtMs <= observedAtMs && messageAgeMs > AUTO_RESUME_HISTORY_FRESH_MS) {
      logger.info(
        `[auto-resume] Parsed reset time for "${teamName}" passed its buffered fire deadline ${Math.round((observedAtMs - targetFireAtMs) / 1000)}s ago - skipping stale history replay`
      );
      return;
    }

    if (rawDelayMs < 0) {
      logger.warn(
        `[auto-resume] Parsed reset time for "${teamName}" is ${Math.round(-rawDelayMs / 1000)}s in the past - using remaining buffered delay`
      );
    }

    const delayMs = Math.max(0, targetFireAtMs - observedAtMs);
    const fireAtMs = observedAtMs + delayMs;

    if (delayMs > AUTO_RESUME_MAX_DELAY_MS) {
      if (existing) {
        clearTimeout(existing.timer);
        this.pendingTimers.delete(teamName);
      }
      logger.warn(
        `[auto-resume] Parsed reset time for "${teamName}" is ${Math.round(delayMs / 60000)}m away - exceeds ceiling, skipping`
      );
      return;
    }

    if (
      existing?.fireAtMs === fireAtMs &&
      existing.sourceMessageAtMs === messageAtMs &&
      existing.sourceRunId === sourceRunId
    ) {
      return;
    }

    if (existing) {
      clearTimeout(existing.timer);
      this.pendingTimers.delete(teamName);
      logger.info(
        `[auto-resume] Rescheduling resume for "${teamName}" to ${resetTime.toISOString()}`
      );
    } else {
      logger.info(
        `[auto-resume] Scheduling resume for "${teamName}" at ${resetTime.toISOString()} (in ${Math.round(delayMs / 1000)}s)`
      );
    }

    const timer = setTimeout(() => {
      this.pendingTimers.delete(teamName);
      void this.fireResumeNudge(teamName, sourceRunId);
    }, delayMs);

    this.pendingTimers.set(teamName, {
      timer,
      fireAtMs,
      sourceMessageAtMs: messageAtMs,
      sourceRunId,
    });
  }

  cancelPendingAutoResume(teamName: string): void {
    const pending = this.pendingTimers.get(teamName);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTimers.delete(teamName);
  }

  clearAllPendingAutoResume(): void {
    for (const pending of this.pendingTimers.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingTimers.clear();
  }

  private async fireResumeNudge(teamName: string, sourceRunId: string | null): Promise<void> {
    const current = this.configManager.getConfig();
    if (!current.notifications.autoResumeOnRateLimit) {
      logger.info(
        `[auto-resume] Config flag was disabled while timer was pending - skipping nudge for "${teamName}"`
      );
      return;
    }

    try {
      if (!this.provisioningService.isTeamAlive(teamName)) {
        logger.info(
          `[auto-resume] Team "${teamName}" is no longer alive at fire time - skipping resume nudge`
        );
        return;
      }
      const currentRunId = this.provisioningService.getCurrentRunId(teamName);
      if (sourceRunId && currentRunId !== sourceRunId) {
        logger.info(
          `[auto-resume] Team "${teamName}" advanced from run "${sourceRunId}" to "${currentRunId ?? 'none'}" before fire time - skipping stale resume nudge`
        );
        return;
      }
      await this.provisioningService.sendMessageToTeam(teamName, AUTO_RESUME_MESSAGE);
      logger.info(`[auto-resume] Sent resume nudge to "${teamName}"`);
    } catch (error) {
      logger.error(
        `[auto-resume] Failed to send resume nudge to "${teamName}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

let autoResumeService: AutoResumeService | null = null;

export function initializeAutoResumeService(
  provisioningService: AutoResumeProvisioning
): AutoResumeService {
  autoResumeService?.clearAllPendingAutoResume();
  autoResumeService = new AutoResumeService(provisioningService);
  return autoResumeService;
}

export function getAutoResumeService(): AutoResumeService {
  if (!autoResumeService) {
    throw new Error('AutoResumeService is not initialized');
  }
  return autoResumeService;
}

export function peekAutoResumeService(): AutoResumeService | null {
  return autoResumeService;
}

export function clearAutoResumeService(): void {
  autoResumeService?.clearAllPendingAutoResume();
  autoResumeService = null;
}
