import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { registerTeamRoutes } from '@main/http/teams';
import type { HttpServices } from '@main/http';
import type {
  TeamCreateConfigRequest,
  TeamCreateRequest,
  TeamLaunchRequest,
  TeamLaunchResponse,
  TeamProvisioningProgress,
  TeamRuntimeState,
  TeamSummary,
  TeamViewSnapshot,
} from '@shared/types/team';

describe('HTTP team runtime routes', () => {
  function createServicesMock() {
    const launchTeam =
      vi.fn<
        (
          request: TeamLaunchRequest,
          onProgress: (progress: TeamProvisioningProgress) => void
        ) => Promise<TeamLaunchResponse>
      >();
    const getRuntimeState = vi.fn<(teamName: string) => Promise<TeamRuntimeState>>();
    const getProvisioningStatus = vi.fn<(runId: string) => Promise<TeamProvisioningProgress>>();
    const stopTeam = vi.fn<(teamName: string) => Promise<void>>(() => Promise.resolve());
    const getAliveTeams = vi.fn<() => string[]>();
    const createTeam =
      vi.fn<
        (
          request: TeamCreateRequest,
          onProgress: (progress: TeamProvisioningProgress) => void
        ) => Promise<TeamLaunchResponse>
      >();
    const listTeams = vi.fn<() => Promise<TeamSummary[]>>();
    const getTeamData = vi.fn<(teamName: string) => Promise<TeamViewSnapshot>>();
    const getSavedRequest = vi.fn<(teamName: string) => Promise<TeamCreateRequest | null>>();
    const createTeamConfig = vi.fn<(request: TeamCreateConfigRequest) => Promise<void>>(() =>
      Promise.resolve()
    );
    const teamProvisioningService = {
      createTeam,
      launchTeam,
      getRuntimeState,
      getProvisioningStatus,
      stopTeam,
      getAliveTeams,
    } as Pick<
      NonNullable<HttpServices['teamProvisioningService']>,
      | 'createTeam'
      | 'launchTeam'
      | 'getRuntimeState'
      | 'getProvisioningStatus'
      | 'stopTeam'
      | 'getAliveTeams'
    > as HttpServices['teamProvisioningService'];
    const teamDataService = {
      listTeams,
      getTeamData,
      getSavedRequest,
      createTeamConfig,
    } as Pick<
      NonNullable<HttpServices['teamDataService']>,
      'listTeams' | 'getTeamData' | 'getSavedRequest' | 'createTeamConfig'
    > as HttpServices['teamDataService'];

    const services = {
      projectScanner: {} as HttpServices['projectScanner'],
      sessionParser: {} as HttpServices['sessionParser'],
      subagentResolver: {} as HttpServices['subagentResolver'],
      chunkBuilder: {} as HttpServices['chunkBuilder'],
      dataCache: {} as HttpServices['dataCache'],
      updaterService: {} as HttpServices['updaterService'],
      sshConnectionManager: {} as HttpServices['sshConnectionManager'],
      teamDataService,
      teamProvisioningService,
    } satisfies HttpServices;

    return {
      services,
      launchTeam,
      getRuntimeState,
      getProvisioningStatus,
      stopTeam,
      getAliveTeams,
      createTeam,
      listTeams,
      getTeamData,
      getSavedRequest,
      createTeamConfig,
    };
  }

  async function createApp() {
    const app = Fastify();
    const mocks = createServicesMock();
    registerTeamRoutes(app, mocks.services);
    await app.ready();
    return { app, ...mocks };
  }

  it('lists, gets, and creates draft teams through team data service', async () => {
    const { app, listTeams, getTeamData, createTeamConfig } = await createApp();
    listTeams.mockResolvedValue([
      {
        teamName: 'demo-team',
        displayName: 'Demo Team',
        description: 'Demo',
        memberCount: 1,
        taskCount: 0,
        lastActivity: null,
        pendingCreate: true,
      },
    ]);
    getTeamData.mockResolvedValue({
      teamName: 'demo-team',
      config: null,
      tasks: [],
      messages: [],
      processes: [],
      kanban: null,
    } as unknown as TeamViewSnapshot);

    try {
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/teams',
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()[0]).toMatchObject({
        teamName: 'demo-team',
        pendingCreate: true,
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/teams/demo-team',
      });
      expect(getResponse.statusCode).toBe(200);
      expect(getTeamData).toHaveBeenCalledWith('demo-team');

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/teams',
        payload: {
          teamName: 'new-team',
          displayName: 'New Team',
          members: [{ name: 'builder', role: 'Engineer', providerId: 'codex' }],
          cwd: '/Users/test/project',
          providerId: 'codex',
          model: 'gpt-5.2',
          effort: 'high',
          fastMode: 'on',
          limitContext: true,
        },
      });
      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json()).toEqual({ teamName: 'new-team' });
      expect(createTeamConfig).toHaveBeenCalledWith({
        teamName: 'new-team',
        displayName: 'New Team',
        members: [
          {
            name: 'builder',
            role: 'Engineer',
            providerId: 'codex',
            providerBackendId: 'codex-native',
          },
        ],
        cwd: '/Users/test/project',
        providerId: 'codex',
        providerBackendId: 'codex-native',
        model: 'gpt-5.2',
        effort: 'high',
        fastMode: 'on',
        limitContext: true,
      });
    } finally {
      await app.close();
    }
  });

  it('launches a team with validated request payload', async () => {
    const { app, launchTeam } = await createApp();
    launchTeam.mockResolvedValue({ runId: 'run-1' });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/teams/demo-team/launch',
        payload: {
          cwd: '/Users/test/project',
          prompt: 'Resume work',
          skipPermissions: false,
          clearContext: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ runId: 'run-1' });
      expect(launchTeam).toHaveBeenCalledWith(
        {
          teamName: 'demo-team',
          cwd: '/Users/test/project',
          prompt: 'Resume work',
          providerId: 'anthropic',
          skipPermissions: false,
          clearContext: true,
        },
        expect.any(Function)
      );
    } finally {
      await app.close();
    }
  });

  it('routes draft team launch through createTeam with saved metadata', async () => {
    const { app, createTeam, getSavedRequest, launchTeam } = await createApp();
    getSavedRequest.mockResolvedValue({
      teamName: 'draft-team',
      displayName: 'Draft Team',
      description: 'Saved draft',
      color: '#3366ff',
      cwd: '/Users/test/saved-project',
      prompt: 'Saved prompt',
      providerId: 'codex',
      providerBackendId: 'codex-native',
      model: 'gpt-5.2',
      effort: 'medium',
      fastMode: 'on',
      limitContext: true,
      members: [{ name: 'builder', role: 'Engineer', providerId: 'codex' }],
    });
    createTeam.mockResolvedValue({ runId: 'run-draft' });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/teams/draft-team/launch',
        payload: {
          cwd: '/Users/test/project',
          effort: 'high',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ runId: 'run-draft' });
      expect(launchTeam).not.toHaveBeenCalled();
      expect(createTeam).toHaveBeenCalledWith(
        {
          teamName: 'draft-team',
          displayName: 'Draft Team',
          description: 'Saved draft',
          color: '#3366ff',
          members: [{ name: 'builder', role: 'Engineer', providerId: 'codex' }],
          cwd: '/Users/test/project',
          prompt: 'Saved prompt',
          providerId: 'codex',
          providerBackendId: 'codex-native',
          model: 'gpt-5.2',
          effort: 'high',
          fastMode: 'on',
          limitContext: true,
        },
        expect.any(Function)
      );
    } finally {
      await app.close();
    }
  });

  it('returns saved metadata for draft team get without requiring config.json', async () => {
    const { app, getSavedRequest, getTeamData } = await createApp();
    getSavedRequest.mockResolvedValue({
      teamName: 'draft-team',
      displayName: 'Draft Team',
      cwd: '/Users/test/project',
      providerId: 'codex',
      providerBackendId: 'codex-native',
      members: [{ name: 'builder', role: 'Engineer', providerId: 'codex' }],
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/teams/draft-team',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        teamName: 'draft-team',
        pendingCreate: true,
        savedRequest: {
          teamName: 'draft-team',
          displayName: 'Draft Team',
          cwd: '/Users/test/project',
          providerId: 'codex',
          providerBackendId: 'codex-native',
          members: [{ name: 'builder', role: 'Engineer', providerId: 'codex' }],
        },
      });
      expect(getTeamData).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects launch requests with non-absolute cwd', async () => {
    const { app, launchTeam } = await createApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/teams/demo-team/launch',
        payload: {
          cwd: 'relative/path',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'cwd must be an absolute path' });
      expect(launchTeam).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns runtime state, provisioning status, and stop results', async () => {
    const { app, getRuntimeState, getProvisioningStatus, stopTeam, getAliveTeams } =
      await createApp();
    getRuntimeState
      .mockResolvedValueOnce({
        teamName: 'demo-team',
        isAlive: true,
        runId: 'run-2',
        progress: {
          runId: 'run-2',
          teamName: 'demo-team',
          state: 'ready',
          message: 'Ready',
          startedAt: '2026-03-12T00:00:00.000Z',
          updatedAt: '2026-03-12T00:00:01.000Z',
        },
      })
      .mockResolvedValueOnce({
        teamName: 'demo-team',
        isAlive: false,
        runId: null,
        progress: null,
      })
      .mockResolvedValueOnce({
        teamName: 'demo-team',
        isAlive: true,
        runId: 'run-2',
        progress: {
          runId: 'run-2',
          teamName: 'demo-team',
          state: 'ready',
          message: 'Ready',
          startedAt: '2026-03-12T00:00:00.000Z',
          updatedAt: '2026-03-12T00:00:01.000Z',
        },
      });
    getProvisioningStatus.mockResolvedValue({
      runId: 'run-2',
      teamName: 'demo-team',
      state: 'ready',
      message: 'Ready',
      startedAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:01.000Z',
    });
    getAliveTeams.mockReturnValue(['demo-team']);

    try {
      const runtimeResponse = await app.inject({
        method: 'GET',
        url: '/api/teams/demo-team/runtime',
      });
      expect(runtimeResponse.statusCode).toBe(200);
      expect(runtimeResponse.json().isAlive).toBe(true);

      const provisioningResponse = await app.inject({
        method: 'GET',
        url: '/api/teams/provisioning/run-2',
      });
      expect(provisioningResponse.statusCode).toBe(200);
      expect(provisioningResponse.json().runId).toBe('run-2');

      const stopResponse = await app.inject({
        method: 'POST',
        url: '/api/teams/demo-team/stop',
      });
      expect(stopResponse.statusCode).toBe(200);
      expect(stopResponse.json()).toEqual({
        teamName: 'demo-team',
        isAlive: false,
        runId: null,
        progress: null,
      });
      expect(stopTeam).toHaveBeenCalledWith('demo-team');

      const aliveResponse = await app.inject({
        method: 'GET',
        url: '/api/teams/runtime/alive',
      });
      expect(aliveResponse.statusCode).toBe(200);
      expect(aliveResponse.json()).toEqual([
        {
          teamName: 'demo-team',
          isAlive: true,
          runId: 'run-2',
          progress: {
            runId: 'run-2',
            teamName: 'demo-team',
            state: 'ready',
            message: 'Ready',
            startedAt: '2026-03-12T00:00:00.000Z',
            updatedAt: '2026-03-12T00:00:01.000Z',
          },
        },
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns 501 when team runtime routes are registered without a runtime service', async () => {
    const app = Fastify();
    registerTeamRoutes(app, {
      projectScanner: {} as HttpServices['projectScanner'],
      sessionParser: {} as HttpServices['sessionParser'],
      subagentResolver: {} as HttpServices['subagentResolver'],
      chunkBuilder: {} as HttpServices['chunkBuilder'],
      dataCache: {} as HttpServices['dataCache'],
      updaterService: {} as HttpServices['updaterService'],
      sshConnectionManager: {} as HttpServices['sshConnectionManager'],
    } satisfies HttpServices);
    await app.ready();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/teams/runtime/alive',
      });

      expect(response.statusCode).toBe(501);
      expect(response.json()).toEqual({
        error: 'Team runtime control is not available in this mode',
      });
    } finally {
      await app.close();
    }
  });
});
