import { createLogger } from '@shared/utils/logger';
import { parseRateLimitResetTime } from '@shared/utils/rateLimitDetector';

import { ConfigManager } from '../infrastructure/ConfigManager';

import type { TeamProvisioningService } from './TeamProvisioningService';

const logger = createLogger('Service:AutoResume');

const AUTO_RESUME_BUFFER_MS = 30 * 1000;
const AUTO_RESUME_MAX_DELAY_MS = 12 * 60 * 60 * 1000;
const AUTO_RESUME_MESSAGE =
  'Your rate limit has reset. Please resume the work you were doing before the limit was hit.';

interface PendingAutoResumeEntry {
  timer: NodeJS.Timeout;
  fireAtMs: number;
}

type AutoResumeProvisioning = Pick<TeamProvisioningService, 'isTeamAlive' | 'sendMessageToTeam'>;
type AutoResumeConfigReader = Pick<ConfigManager, 'getConfig'>;

export class AutoResumeService {
  private readonly pendingTimers = new Map<string, PendingAutoResumeEntry>();

  constructor(
    private readonly provisioningService: AutoResumeProvisioning,
    private readonly configManager: AutoResumeConfigReader = ConfigManager.getInstance()
  ) {}

  handleRateLimitMessage(teamName: string, messageText: string, now: Date = new Date()): void {
    const cfg = this.configManager.getConfig();
    if (!cfg.notifications.autoResumeOnRateLimit) return;

    const resetTime = parseRateLimitResetTime(messageText, now);
    if (!resetTime) {
      logger.info(
        `[auto-resume] Rate limit detected for "${teamName}" but reset time was not parseable - skipping auto-resume`
      );
      return;
    }

    const rawDelayMs = resetTime.getTime() - now.getTime();
    if (rawDelayMs < 0) {
      logger.warn(
        `[auto-resume] Parsed reset time for "${teamName}" is ${Math.round(-rawDelayMs / 1000)}s in the past - firing after buffer only`
      );
    }

    const delayMs = Math.max(0, rawDelayMs) + AUTO_RESUME_BUFFER_MS;
    const fireAtMs = now.getTime() + delayMs;
    const existing = this.pendingTimers.get(teamName);

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

    if (existing?.fireAtMs === fireAtMs) return;

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
      void this.fireResumeNudge(teamName);
    }, delayMs);

    this.pendingTimers.set(teamName, { timer, fireAtMs });
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

  private async fireResumeNudge(teamName: string): Promise<void> {
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

export function clearAutoResumeService(): void {
  autoResumeService?.clearAllPendingAutoResume();
  autoResumeService = null;
}
