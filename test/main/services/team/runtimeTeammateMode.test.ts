import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsTmuxRuntimeReadyForCurrentPlatform = vi.fn<() => Promise<boolean>>();

vi.mock('@features/tmux-installer/main', () => ({
  isTmuxRuntimeReadyForCurrentPlatform: mockIsTmuxRuntimeReadyForCurrentPlatform,
}));

describe('runtimeTeammateMode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('enables process teammates in auto mode when tmux runtime is ready', async () => {
    mockIsTmuxRuntimeReadyForCurrentPlatform.mockResolvedValue(true);
    const { resolveDesktopTeammateModeDecision } =
      await import('@main/services/team/runtimeTeammateMode');

    const decision = await resolveDesktopTeammateModeDecision(undefined);

    expect(decision.forceProcessTeammates).toBe(true);
    expect(decision.injectedTeammateMode).toBe('tmux');
  });

  it('keeps fallback mode when tmux runtime is not ready', async () => {
    mockIsTmuxRuntimeReadyForCurrentPlatform.mockResolvedValue(false);
    const { resolveDesktopTeammateModeDecision } =
      await import('@main/services/team/runtimeTeammateMode');

    const decision = await resolveDesktopTeammateModeDecision(undefined);

    expect(decision.forceProcessTeammates).toBe(false);
    expect(decision.injectedTeammateMode).toBeNull();
  });

  it('re-checks tmux readiness after the environment changes instead of keeping a stale negative cache', async () => {
    mockIsTmuxRuntimeReadyForCurrentPlatform
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { resolveDesktopTeammateModeDecision } =
      await import('@main/services/team/runtimeTeammateMode');

    const firstDecision = await resolveDesktopTeammateModeDecision(undefined);
    const secondDecision = await resolveDesktopTeammateModeDecision(undefined);

    expect(firstDecision.forceProcessTeammates).toBe(false);
    expect(firstDecision.injectedTeammateMode).toBeNull();
    expect(secondDecision.forceProcessTeammates).toBe(true);
    expect(secondDecision.injectedTeammateMode).toBe('tmux');
  });
});
