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

  it('uses native process teammates when tmux runtime is not ready', async () => {
    mockIsTmuxRuntimeReadyForCurrentPlatform.mockResolvedValue(false);
    const { resolveDesktopTeammateModeDecision } =
      await import('@main/services/team/runtimeTeammateMode');

    const decision = await resolveDesktopTeammateModeDecision(undefined);

    expect(decision.forceProcessTeammates).toBe(true);
    expect(decision.injectedTeammateMode).toBeNull();
  });

  it('treats explicit auto mode as automatic process teammate selection without injection', async () => {
    mockIsTmuxRuntimeReadyForCurrentPlatform.mockResolvedValue(true);
    const { resolveDesktopTeammateModeDecision } =
      await import('@main/services/team/runtimeTeammateMode');

    const decision = await resolveDesktopTeammateModeDecision('--teammate-mode auto');
    const equalsDecision = await resolveDesktopTeammateModeDecision('--teammate-mode=auto');

    expect(decision.forceProcessTeammates).toBe(true);
    expect(decision.injectedTeammateMode).toBeNull();
    expect(equalsDecision.forceProcessTeammates).toBe(true);
    expect(equalsDecision.injectedTeammateMode).toBeNull();
    expect(mockIsTmuxRuntimeReadyForCurrentPlatform).not.toHaveBeenCalled();
  });

  it('honors explicit in-process mode as an opt-out from process teammates', async () => {
    mockIsTmuxRuntimeReadyForCurrentPlatform.mockResolvedValue(true);
    const { resolveDesktopTeammateModeDecision } =
      await import('@main/services/team/runtimeTeammateMode');

    const decision = await resolveDesktopTeammateModeDecision('--teammate-mode=in-process');

    expect(decision.forceProcessTeammates).toBe(false);
    expect(decision.injectedTeammateMode).toBeNull();
    expect(mockIsTmuxRuntimeReadyForCurrentPlatform).not.toHaveBeenCalled();
  });

  it('removes inherited process fallback env when explicit in-process mode opts out', async () => {
    const { applyDesktopTeammateModeDecisionToEnv } =
      await import('@main/services/team/runtimeTeammateMode');
    const env = {
      CLAUDE_TEAM_FORCE_PROCESS_TEAMMATES: '1',
    };

    applyDesktopTeammateModeDecisionToEnv(env, { forceProcessTeammates: false });

    expect(env).not.toHaveProperty('CLAUDE_TEAM_FORCE_PROCESS_TEAMMATES');
  });

  it('builds injected teammate mode cli args only when a mode was selected', async () => {
    const { buildDesktopTeammateModeCliArgs } =
      await import('@main/services/team/runtimeTeammateMode');

    expect(buildDesktopTeammateModeCliArgs({ injectedTeammateMode: 'tmux' })).toEqual([
      '--teammate-mode',
      'tmux',
    ]);
    expect(buildDesktopTeammateModeCliArgs({ injectedTeammateMode: null })).toEqual([]);
  });

  it('re-checks tmux readiness after the environment changes instead of keeping a stale negative cache', async () => {
    mockIsTmuxRuntimeReadyForCurrentPlatform
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { resolveDesktopTeammateModeDecision } =
      await import('@main/services/team/runtimeTeammateMode');

    const firstDecision = await resolveDesktopTeammateModeDecision(undefined);
    const secondDecision = await resolveDesktopTeammateModeDecision(undefined);

    expect(firstDecision.forceProcessTeammates).toBe(true);
    expect(firstDecision.injectedTeammateMode).toBeNull();
    expect(secondDecision.forceProcessTeammates).toBe(true);
    expect(secondDecision.injectedTeammateMode).toBe('tmux');
  });
});
