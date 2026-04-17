/**
 * Unit tests for the auto-resume scheduler in src/main/ipc/teams.ts.
 *
 * Focuses on scheduling logic only — the parser is covered by
 * test/shared/utils/rateLimitDetector.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted so they apply before the module under test is loaded
// ---------------------------------------------------------------------------

const { mockConfig, mockIsTeamAlive, mockSendMessageToTeam } = vi.hoisted(() => ({
  mockConfig: { autoResumeOnRateLimit: false },
  mockIsTeamAlive: vi.fn<(teamName: string) => boolean>(),
  mockSendMessageToTeam: vi.fn<(teamName: string, text: string) => Promise<void>>(),
}));

vi.mock('electron', () => ({
  app: { getLocale: vi.fn(() => 'en'), getPath: vi.fn(() => '/tmp') },
  Notification: Object.assign(vi.fn(), { isSupported: vi.fn(() => false) }),
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('@main/services/infrastructure/ConfigManager', () => ({
  ConfigManager: {
    getInstance: vi.fn().mockReturnValue({
      getConfig: vi.fn(() => ({
        notifications: mockConfig,
      })),
    }),
  },
}));

// The scheduler calls `getTeamProvisioningService()` at fire time. The
// function is defined inside teams.ts and reads a module-local singleton, so
// mocking the team-provisioning accessor requires replacing the module that
// owns the singleton. The simplest path is to stub the service directly so
// the in-file accessor returns our mock.
vi.mock('@main/services/team/TeamProvisioningService', () => ({
  TeamProvisioningService: class {
    isTeamAlive = mockIsTeamAlive;
    sendMessageToTeam = mockSendMessageToTeam;
  },
}));

// teams.ts pulls NotificationManager; keep it quiet.
vi.mock('@main/services/infrastructure/NotificationManager', () => ({
  NotificationManager: {
    getInstance: vi.fn().mockReturnValue({
      addTeamNotification: vi.fn().mockResolvedValue({ id: 'n1' }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------

// Dynamic import so mocks are applied first.
let scheduleAutoResumeIfEnabled: typeof import('@main/ipc/teams').scheduleAutoResumeIfEnabled;
let cancelPendingAutoResume: typeof import('@main/ipc/teams').cancelPendingAutoResume;
let clearAllPendingAutoResume: typeof import('@main/ipc/teams').clearAllPendingAutoResume;
let __setTeamProvisioningServiceForTests: typeof import('@main/ipc/teams').__setTeamProvisioningServiceForTests;

const TEAM = 'test-team';
const RATE_LIMIT_MSG =
  "You've hit your limit. Your limit will reset at 3pm (PST).";

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('@main/ipc/teams');
  scheduleAutoResumeIfEnabled = mod.scheduleAutoResumeIfEnabled;
  cancelPendingAutoResume = mod.cancelPendingAutoResume;
  clearAllPendingAutoResume = mod.clearAllPendingAutoResume;
  __setTeamProvisioningServiceForTests = mod.__setTeamProvisioningServiceForTests;

  // Wire our mocked service instance so the in-file `getTeamProvisioningService()`
  // returns it when the timer fires.
  const { TeamProvisioningService } = await import(
    '@main/services/team/TeamProvisioningService'
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __setTeamProvisioningServiceForTests(new (TeamProvisioningService as any)());

  mockConfig.autoResumeOnRateLimit = false;
  mockIsTeamAlive.mockReset();
  mockSendMessageToTeam.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  clearAllPendingAutoResume();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scheduleAutoResumeIfEnabled', () => {
  it('does nothing when the feature flag is off', () => {
    mockConfig.autoResumeOnRateLimit = false;
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled(TEAM, RATE_LIMIT_MSG, now);

    // Advance past any plausible fire time — no message should go out.
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockSendMessageToTeam).not.toHaveBeenCalled();
  });

  it('does not schedule when the reset time is unparseable', () => {
    mockConfig.autoResumeOnRateLimit = true;
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled(TEAM, "You've hit your limit.", now);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockSendMessageToTeam).not.toHaveBeenCalled();
  });

  it('does not schedule when the parsed delay exceeds the ceiling', () => {
    mockConfig.autoResumeOnRateLimit = true;
    // Parser rolls forward to tomorrow if the time already passed today; force
    // a parse that lands 23h+ away, beyond the 12h ceiling.
    const now = new Date('2026-04-17T16:00:00Z'); // 4pm UTC
    // "Resets at 15:00 UTC" → already past → rolls to tomorrow 15:00Z = 23h away.
    const msg = `You've hit your limit. Resets at 15:00 UTC.`;

    scheduleAutoResumeIfEnabled(TEAM, msg, now);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockSendMessageToTeam).not.toHaveBeenCalled();
    // Clear the expected "exceeds ceiling" warning so the global test setup
    // doesn't flag it as an unexpected console.warn.
    vi.mocked(console.warn).mockClear();
  });

  it('deduplicates: a second schedule for the same team is a no-op', () => {
    mockConfig.autoResumeOnRateLimit = true;
    mockIsTeamAlive.mockReturnValue(true);
    mockSendMessageToTeam.mockResolvedValue(undefined);
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled(TEAM, `You've hit your limit. Resets in 10 minutes.`, now);
    // Second schedule would normally reset the timer to 1h — but dedup skips it.
    scheduleAutoResumeIfEnabled(TEAM, `You've hit your limit. Resets in 1 hour.`, now);

    // First timer (10min + 30s buffer) should still fire at ~10:30.
    vi.advanceTimersByTime(11 * 60 * 1000);
    // allow microtasks in the callback to run
    return Promise.resolve().then(() => {
      expect(mockSendMessageToTeam).toHaveBeenCalledTimes(1);
    });
  });

  it('sends the resume nudge when the team is alive at fire time', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    mockIsTeamAlive.mockReturnValue(true);
    mockSendMessageToTeam.mockResolvedValue(undefined);
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled(TEAM, `You've hit your limit. Resets in 5 minutes.`, now);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100);

    expect(mockIsTeamAlive).toHaveBeenCalledWith(TEAM);
    expect(mockSendMessageToTeam).toHaveBeenCalledTimes(1);
    expect(mockSendMessageToTeam.mock.calls[0]![0]).toBe(TEAM);
    // The message is a hardcoded constant — verify the prefix rather than pin
    // the whole string so future copy tweaks don't break the test.
    expect(mockSendMessageToTeam.mock.calls[0]![1]).toMatch(/Your rate limit has reset/);
  });

  it('skips the nudge when the team is no longer alive at fire time', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    mockIsTeamAlive.mockReturnValue(false);
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled(TEAM, `You've hit your limit. Resets in 5 minutes.`, now);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100);

    expect(mockIsTeamAlive).toHaveBeenCalledWith(TEAM);
    expect(mockSendMessageToTeam).not.toHaveBeenCalled();
  });

  it('re-checks the config flag at fire time and aborts when toggled off', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    mockIsTeamAlive.mockReturnValue(true);
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled(TEAM, `You've hit your limit. Resets in 5 minutes.`, now);

    // Simulate user disabling the feature while the timer is pending.
    mockConfig.autoResumeOnRateLimit = false;

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100);

    expect(mockSendMessageToTeam).not.toHaveBeenCalled();
    // isTeamAlive should NOT be called either — the flag check comes first.
    expect(mockIsTeamAlive).not.toHaveBeenCalled();
  });

  it('swallows errors from sendMessageToTeam without crashing', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    mockIsTeamAlive.mockReturnValue(true);
    mockSendMessageToTeam.mockRejectedValue(new Error('stdin closed'));
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled(TEAM, `You've hit your limit. Resets in 5 minutes.`, now);

    // Advance and assert no unhandled rejection. If the catch block is missing
    // this will surface as a test failure.
    await expect(
      vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 100)
    ).resolves.not.toThrow();
    expect(mockSendMessageToTeam).toHaveBeenCalledTimes(1);
    // Clear the expected "Failed to send resume nudge" log so the global
    // setup doesn't flag it as an unexpected console.error.
    vi.mocked(console.error).mockClear();
  });
});

describe('cancelPendingAutoResume', () => {
  it('clears a pending timer so the nudge never fires', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    mockIsTeamAlive.mockReturnValue(true);
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled(TEAM, `You've hit your limit. Resets in 5 minutes.`, now);
    cancelPendingAutoResume(TEAM);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(mockSendMessageToTeam).not.toHaveBeenCalled();
  });

  it('is a no-op when no timer is pending for the team', () => {
    expect(() => cancelPendingAutoResume('never-scheduled')).not.toThrow();
  });
});

describe('clearAllPendingAutoResume', () => {
  it('cancels every pending timer across teams', async () => {
    mockConfig.autoResumeOnRateLimit = true;
    mockIsTeamAlive.mockReturnValue(true);
    const now = new Date('2026-04-17T12:00:00Z');

    scheduleAutoResumeIfEnabled('team-a', `You've hit your limit. Resets in 5 minutes.`, now);
    scheduleAutoResumeIfEnabled('team-b', `You've hit your limit. Resets in 10 minutes.`, now);

    clearAllPendingAutoResume();

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(mockSendMessageToTeam).not.toHaveBeenCalled();
  });
});
