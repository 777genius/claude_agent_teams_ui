import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AutoResumeService } from '../../../../src/main/services/team/AutoResumeService';

import type { ConfigManager } from '../../../../src/main/services/infrastructure/ConfigManager';

const TEAM = 'test-team';
const RATE_LIMIT_MSG = "You've hit your limit. Resets in 5 minutes.";

describe('AutoResumeService', () => {
  const mockConfig = { autoResumeOnRateLimit: false };
  const configManager = {
    getConfig: vi.fn(() => ({
      notifications: {
        autoResumeOnRateLimit: mockConfig.autoResumeOnRateLimit,
      },
    })),
  } as unknown as Pick<ConfigManager, 'getConfig'>;
  const provisioningService = {
    isTeamAlive: vi.fn<(teamName: string) => boolean>(),
    sendMessageToTeam: vi.fn<(teamName: string, text: string) => Promise<void>>(),
  };

  let service: AutoResumeService;

  beforeEach(() => {
    mockConfig.autoResumeOnRateLimit = false;
    provisioningService.isTeamAlive.mockReset();
    provisioningService.sendMessageToTeam.mockReset();
    configManager.getConfig.mockClear();
    service = new AutoResumeService(provisioningService, configManager);
    vi.useFakeTimers();
  });

  afterEach(() => {
    service.clearAllPendingAutoResume();
    vi.useRealTimers();
  });

  it('does nothing when the feature flag is off', () => {
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, RATE_LIMIT_MSG, now);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(provisioningService.sendMessageToTeam).not.toHaveBeenCalled();
  });

  it('does not schedule when the reset time is unparseable', () => {
    mockConfig.autoResumeOnRateLimit = true;
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, "You've hit your limit.", now);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(provisioningService.sendMessageToTeam).not.toHaveBeenCalled();
  });

  it('reschedules when a later rate-limit message changes the reset time', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(true);
    provisioningService.sendMessageToTeam.mockResolvedValue(undefined);
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, `You've hit your limit. Resets in 1 minute.`, now);
    service.handleRateLimitMessage(TEAM, `You've hit your limit. Resets in 10 minutes.`, now);

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(provisioningService.sendMessageToTeam).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(8 * 60 * 1000 + 30 * 1000 + 100);
    expect(provisioningService.sendMessageToTeam).toHaveBeenCalledTimes(1);
  });

  it('keeps only one timer when the same reset time is reported again', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(true);
    provisioningService.sendMessageToTeam.mockResolvedValue(undefined);
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, RATE_LIMIT_MSG, now);
    service.handleRateLimitMessage(TEAM, RATE_LIMIT_MSG, now);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100);
    expect(provisioningService.sendMessageToTeam).toHaveBeenCalledTimes(1);
  });

  it('clears a stale pending timer when a newer reset exceeds the ceiling', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(true);
    provisioningService.sendMessageToTeam.mockResolvedValue(undefined);
    const now = new Date('2026-04-17T16:00:00Z');

    service.handleRateLimitMessage(TEAM, `You've hit your limit. Resets in 5 minutes.`, now);
    service.handleRateLimitMessage(TEAM, `You've hit your limit. Resets at 15:00 UTC.`, now);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(provisioningService.sendMessageToTeam).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('exceeds ceiling')
    );
    warnSpy.mockRestore();
  });

  it('sends the resume nudge when the team is alive at fire time', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(true);
    provisioningService.sendMessageToTeam.mockResolvedValue(undefined);
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, RATE_LIMIT_MSG, now);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100);

    expect(provisioningService.isTeamAlive).toHaveBeenCalledWith(TEAM);
    expect(provisioningService.sendMessageToTeam).toHaveBeenCalledTimes(1);
    expect(provisioningService.sendMessageToTeam.mock.calls[0]![0]).toBe(TEAM);
    expect(provisioningService.sendMessageToTeam.mock.calls[0]![1]).toMatch(
      /Your rate limit has reset/
    );
  });

  it('skips the nudge when the team is no longer alive at fire time', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(false);
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, RATE_LIMIT_MSG, now);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100);

    expect(provisioningService.isTeamAlive).toHaveBeenCalledWith(TEAM);
    expect(provisioningService.sendMessageToTeam).not.toHaveBeenCalled();
  });

  it('re-checks the config flag at fire time and aborts when toggled off', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(true);
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, RATE_LIMIT_MSG, now);
    mockConfig.autoResumeOnRateLimit = false;

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100);

    expect(provisioningService.sendMessageToTeam).not.toHaveBeenCalled();
    expect(provisioningService.isTeamAlive).not.toHaveBeenCalled();
  });

  it('swallows errors from sendMessageToTeam without crashing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(true);
    provisioningService.sendMessageToTeam.mockRejectedValue(new Error('stdin closed'));
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, RATE_LIMIT_MSG, now);

    await expect(
      vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100)
    ).resolves.not.toThrow();
    expect(provisioningService.sendMessageToTeam).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Failed to send resume nudge')
    );
    errorSpy.mockRestore();
  });

  it('clears a pending timer so the nudge never fires', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(true);
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage(TEAM, RATE_LIMIT_MSG, now);
    service.cancelPendingAutoResume(TEAM);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(provisioningService.sendMessageToTeam).not.toHaveBeenCalled();
  });

  it('cancels every pending timer across teams', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    provisioningService.isTeamAlive.mockReturnValue(true);
    const now = new Date('2026-04-17T12:00:00Z');

    service.handleRateLimitMessage('team-a', RATE_LIMIT_MSG, now);
    service.handleRateLimitMessage('team-b', `You've hit your limit. Resets in 10 minutes.`, now);

    service.clearAllPendingAutoResume();

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(provisioningService.sendMessageToTeam).not.toHaveBeenCalled();
  });
});
