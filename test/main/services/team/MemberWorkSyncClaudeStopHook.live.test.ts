import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMemberWorkSyncFeature,
  type MemberWorkSyncFeatureFacade,
} from '../../../../src/features/member-work-sync/main';
import { TeamConfigReader } from '../../../../src/main/services/team/TeamConfigReader';
import { TeamDataService } from '../../../../src/main/services/team/TeamDataService';
import { TeamKanbanManager } from '../../../../src/main/services/team/TeamKanbanManager';
import { TeamMembersMetaStore } from '../../../../src/main/services/team/TeamMembersMetaStore';
import { TeamProvisioningService } from '../../../../src/main/services/team/TeamProvisioningService';
import { TeamTaskReader } from '../../../../src/main/services/team/TeamTaskReader';
import {
  getTeamsBasePath,
  setClaudeBasePathOverride,
} from '../../../../src/main/utils/pathDecoder';
import {
  assertExecutable,
  formatMemberWorkSyncDiagnostics,
  formatProgressDump,
  readRuntimeTurnSettledProcessedMetas,
  restoreEnv,
  startMemberWorkSyncControlServer,
  throwIfClaudeTranscriptApiError,
  type MemberWorkSyncLiveControlServer,
  waitUntil,
} from './memberWorkSyncLiveHarness';

import type { TeamChangeEvent, TeamProvisioningProgress } from '../../../../src/shared/types';

vi.mock('../../../../src/main/services/infrastructure/NotificationManager', () => ({
  NotificationManager: {
    getInstance: () => ({
      addTeamNotification: vi.fn(async () => undefined),
    }),
  },
}));

const allowConnectedClaudeAccount =
  process.env.MEMBER_WORK_SYNC_CLAUDE_ALLOW_CONNECTED_ACCOUNT === '1';
const liveDescribe =
  process.env.MEMBER_WORK_SYNC_CLAUDE_STOP_HOOK_LIVE === '1' &&
  (hasLiveAnthropicApiKey() || allowConnectedClaudeAccount)
    ? describe
    : describe.skip;

const DEFAULT_ORCHESTRATOR_CLI = '/Users/belief/dev/projects/claude/agent_teams_orchestrator/cli';
const DEFAULT_MODEL = 'sonnet';
const DEFAULT_EFFORT = 'low' as const;

type ClaudeStopHookLiveScenarioState = 'still_working' | 'caught_up';

interface ClaudeStopHookLiveScenarioContext {
  marker: string;
  memberName: string;
  teamName: string;
  controlUrl: string;
  taskId?: string;
}

interface ClaudeStopHookLiveScenario {
  markerSuffix: string;
  subjectPrefix: string;
  expectedState: ClaudeStopHookLiveScenarioState;
  expectedTaskStatus: 'in_progress' | 'completed';
  expectedMarkerText(marker: string): string;
  buildTaskPromptLines(context: ClaudeStopHookLiveScenarioContext): string[];
  buildInstructionLines(context: Required<ClaudeStopHookLiveScenarioContext>): string[];
}

function hasAcceptedReportForScenario(input: {
  metrics: Awaited<ReturnType<MemberWorkSyncFeatureFacade['getMetrics']>>;
  memberName: string;
  expectedState: ClaudeStopHookLiveScenarioState;
}): boolean {
  return input.metrics.recentEvents.some(
    (event) =>
      event.kind === 'report_accepted' &&
      event.memberName === input.memberName &&
      event.reportState === input.expectedState
  );
}

liveDescribe('Member work sync Claude Stop hook live e2e', () => {
  let tempDir: string;
  let tempClaudeRoot: string;
  let tempHome: string;
  let previousCliPath: string | undefined;
  let previousCliFlavor: string | undefined;
  let previousControlUrl: string | undefined;
  let previousDisableAppBootstrap: string | undefined;
  let previousDisableRuntimeBootstrap: string | undefined;
  let previousHome: string | undefined;
  let previousHistFile: string | undefined;
  let previousUserProfile: string | undefined;
  let svc: TeamProvisioningService | null;
  let feature: MemberWorkSyncFeatureFacade | null;
  let controlServer: MemberWorkSyncLiveControlServer | null;
  let teamName: string | null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'member-work-sync-claude-stop-live-'));
    tempClaudeRoot = path.join(tempDir, '.claude');
    await fs.mkdir(tempClaudeRoot, { recursive: true });
    setClaudeBasePathOverride(tempClaudeRoot);

    previousCliPath = process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH;
    previousCliFlavor = process.env.CLAUDE_TEAM_CLI_FLAVOR;
    previousControlUrl = process.env.CLAUDE_TEAM_CONTROL_URL;
    previousDisableAppBootstrap = process.env.CLAUDE_APP_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;
    previousDisableRuntimeBootstrap = process.env.CLAUDE_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;
    previousHome = process.env.HOME;
    previousHistFile = process.env.HISTFILE;
    previousUserProfile = process.env.USERPROFILE;

    const shouldUseConnectedAccountHome = allowConnectedClaudeAccount && !hasLiveAnthropicApiKey();
    tempHome = shouldUseConnectedAccountHome
      ? resolveConnectedClaudeHome(previousHome)
      : path.join(tempDir, 'home');
    await fs.mkdir(tempHome, { recursive: true });

    process.env.HOME = tempHome;
    process.env.HISTFILE = '/dev/null';
    process.env.USERPROFILE = tempHome;
    process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH =
      process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH?.trim() || DEFAULT_ORCHESTRATOR_CLI;
    process.env.CLAUDE_TEAM_CLI_FLAVOR = 'agent_teams_orchestrator';
    delete process.env.CLAUDE_APP_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;
    delete process.env.CLAUDE_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;

    svc = null;
    feature = null;
    controlServer = null;
    teamName = null;
  });

  afterEach(async () => {
    if (svc && teamName) {
      await svc.stopTeam(teamName).catch(() => undefined);
    }
    svc?.setTeamChangeEmitter(null);
    svc?.setControlApiBaseUrlResolver(null);
    svc?.setRuntimeTurnSettledHookSettingsProvider(null);
    await feature?.dispose().catch(() => undefined);
    await controlServer?.close().catch(() => undefined);

    restoreEnv('CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH', previousCliPath);
    restoreEnv('CLAUDE_TEAM_CLI_FLAVOR', previousCliFlavor);
    restoreEnv('CLAUDE_TEAM_CONTROL_URL', previousControlUrl);
    restoreEnv('CLAUDE_APP_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP', previousDisableAppBootstrap);
    restoreEnv('CLAUDE_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP', previousDisableRuntimeBootstrap);
    restoreEnv('HOME', previousHome);
    restoreEnv('HISTFILE', previousHistFile);
    restoreEnv('USERPROFILE', previousUserProfile);
    setClaudeBasePathOverride(null);
    if (process.env.MEMBER_WORK_SYNC_CLAUDE_KEEP_TEMP === '1') {
      console.info(`[MemberWorkSyncClaudeStopHook.live] preserved temp dir: ${tempDir}`);
    } else {
      await removeTempDirAfterLateShellWrites(tempDir);
    }
  });

  afterAll(async () => {
    await cleanupScopedClaudeStopHookLiveTempDirs();
  });

  async function runClaudeStopHookLiveScenario(
    scenario: ClaudeStopHookLiveScenario
  ): Promise<void> {
    const orchestratorCli = process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH?.trim();
    expect(orchestratorCli).toBeTruthy();
    await assertExecutable(orchestratorCli!);

    const model = process.env.MEMBER_WORK_SYNC_CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
    const startedAt = Date.now();
    const marker = `member-work-sync-claude-stop-live-${scenario.markerSuffix}-${startedAt}`;
    const memberName = 'alice';
    teamName = `member-work-sync-claude-stop-${scenario.markerSuffix}-${startedAt}`;
    const projectPath = path.join(tempDir, 'project');
    await fs.mkdir(projectPath, { recursive: true });
    await fs.writeFile(
      path.join(projectPath, 'README.md'),
      '# Member work sync Claude Stop hook live e2e\n\nKeep this project intentionally tiny.\n',
      'utf8'
    );

    svc = new TeamProvisioningService();
    const activeService = svc;
    const teamDataService = new TeamDataService();
    const configReader = new TeamConfigReader();
    const membersMetaStore = new TeamMembersMetaStore();
    feature = createMemberWorkSyncFeature({
      teamsBasePath: getTeamsBasePath(),
      configReader,
      taskReader: new TeamTaskReader(),
      kanbanManager: new TeamKanbanManager(),
      membersMetaStore,
      isTeamActive: (name) =>
        activeService.isTeamAlive(name) || activeService.hasProvisioningRun(name),
      listLifecycleActiveTeamNames: async () => [teamName!],
      queueQuietWindowMs: 500,
      // Native Claude teammates are registered by the real lead process, but in this
      // headless harness their bootstrap turn can finish before there is a durable
      // member process to prompt. These live assertions still use a real Claude
      // process, real MCP calls, and real Stop hook payloads; this seam keeps the
      // tests focused on hook ingestion instead of tmux liveness.
      runtimeTurnSettledTargetResolver: {
        resolve: async (event) => {
          if (event.provider !== 'claude') {
            return { ok: false, reason: 'unsupported_provider' };
          }
          if (!teamName) {
            return { ok: false, reason: 'missing_team' };
          }
          const config = await configReader.getConfig(teamName);
          const leadSessionId = config?.leadSessionId?.trim();
          if (!leadSessionId || event.sessionId !== leadSessionId) {
            return { ok: false, reason: 'no_matching_member_session' };
          }
          return { ok: true, teamName, memberName };
        },
      },
    });
    activeService.setTeamChangeEmitter((event: TeamChangeEvent) => feature!.noteTeamChange(event));
    activeService.setRuntimeTurnSettledHookSettingsProvider((input) =>
      feature!.buildRuntimeTurnSettledHookSettings(input)
    );

    controlServer = await startMemberWorkSyncControlServer(feature);
    process.env.CLAUDE_TEAM_CONTROL_URL = controlServer.baseUrl;
    activeService.setControlApiBaseUrlResolver(async () => controlServer?.baseUrl ?? null);
    await fs.writeFile(
      path.join(tempClaudeRoot, 'team-control-api.json'),
      JSON.stringify({ baseUrl: controlServer.baseUrl }, null, 2),
      'utf8'
    );

    const progressEvents: TeamProvisioningProgress[] = [];
    await activeService.createTeam(
      {
        teamName,
        cwd: projectPath,
        providerId: 'anthropic',
        model,
        effort: DEFAULT_EFFORT,
        skipPermissions: true,
        prompt: [
          'Keep launch work minimal and wait for the explicit live-test instruction.',
          'Do not inspect tasks or send messages until the next user turn.',
        ].join(' '),
        members: [
          {
            name: memberName,
            role: 'Developer',
            providerId: 'anthropic',
            model,
            effort: DEFAULT_EFFORT,
          },
        ],
      },
      (progress) => {
        progressEvents.push(progress);
      }
    );

    await waitUntil(async () => {
      const last = progressEvents.at(-1);
      if (last?.state === 'failed') {
        throw new Error(formatProgressDump(progressEvents));
      }
      return last?.state === 'ready';
    }, 240_000);
    await throwIfClaudeTranscriptApiError({
      claudeRoot: tempClaudeRoot,
      context: 'Claude team launch',
    });

    await expect(
      fs.stat(
        path.join(
          getTeamsBasePath(),
          '.member-work-sync/runtime-hooks/bin/turn-settled-hook-v1.sh'
        )
      )
    ).resolves.toMatchObject({ mode: expect.any(Number) });

    const taskPromptContext: ClaudeStopHookLiveScenarioContext = {
      marker,
      memberName,
      teamName,
      controlUrl: controlServer.baseUrl,
    };
    const task = await teamDataService.createTask(teamName, {
      subject: `${scenario.subjectPrefix} ${marker}`,
      owner: memberName,
      startImmediately: true,
      prompt: scenario.buildTaskPromptLines(taskPromptContext).join('\n'),
    });
    feature.noteTeamChange({ type: 'task', teamName, taskId: task.id });

    await waitUntil(async () => {
      const status = await feature!.getStatus({ teamName: teamName!, memberName });
      return (
        status.memberName === memberName &&
        status.providerId === 'anthropic' &&
        status.agenda.items.some((item) => item.taskId === task.id) &&
        status.shadow?.wouldNudge === true
      );
    }, 30_000);

    const processedMetasBeforeValidation = await readRuntimeTurnSettledProcessedMetas(
      getTeamsBasePath()
    );
    const processedMetaPathsBeforeValidation = new Set(
      processedMetasBeforeValidation.map(({ filePath }) => filePath)
    );
    const validationSentAt = Date.now();

    await activeService.sendMessageToTeam(
      teamName,
      scenario
        .buildInstructionLines({
          ...taskPromptContext,
          taskId: task.id,
        })
        .join('\n')
    );

    await waitUntil(async () => {
      await throwIfClaudeTranscriptApiError({
        claudeRoot: tempClaudeRoot,
        context: 'Claude validation turn',
      });
      await feature!.replayPendingReports([teamName!]);
      const [status, metrics, tasks] = await Promise.all([
        feature!.getStatus({ teamName: teamName!, memberName }),
        feature!.getMetrics({ teamName: teamName! }),
        new TeamTaskReader().getTasks(teamName!),
      ]);
      const currentTask = tasks.find((candidate) => candidate.id === task.id);
      const expectedMarker = scenario.expectedMarkerText(marker);
      const hasMarkerComment = currentTask?.comments?.some(
        (comment) => comment.author === memberName && comment.text.includes(expectedMarker)
      );
      const reportAccepted =
        (status.report?.accepted === true && status.report.state === scenario.expectedState) ||
        hasAcceptedReportForScenario({
          metrics,
          memberName,
          expectedState: scenario.expectedState,
        });
      return Boolean(
        hasMarkerComment &&
          currentTask?.status === scenario.expectedTaskStatus &&
          reportAccepted
      );
    }, 300_000, 2_000, async () =>
      formatMemberWorkSyncDiagnostics({
        feature: feature!,
        teamName: teamName!,
        memberName,
        taskId: task.id,
      })
    );

    const beforeTurnSettledReconciled = feature.getQueueDiagnostics().reconciled;
    await waitUntil(async () => {
      await throwIfClaudeTranscriptApiError({
        claudeRoot: tempClaudeRoot,
        context: 'Claude Stop hook turn',
      });
      await feature!.drainRuntimeTurnSettledEvents();
      const metas = await readRuntimeTurnSettledProcessedMetas(getTeamsBasePath());
      return metas.some(({ filePath, meta }) => {
        const event = meta.event as Record<string, unknown> | undefined;
        const recordedAt =
          typeof event?.recordedAt === 'string' ? Date.parse(event.recordedAt) : Number.NaN;
        return (
          !processedMetaPathsBeforeValidation.has(filePath) &&
          meta.outcome === 'enqueued' &&
          meta.teamName === teamName &&
          meta.memberName === memberName &&
          event?.provider === 'claude' &&
          Number.isFinite(recordedAt) &&
          recordedAt >= validationSentAt
        );
      });
    }, 180_000, 2_000, async () =>
      formatMemberWorkSyncDiagnostics({
        feature: feature!,
        teamName: teamName!,
        memberName,
        taskId: task.id,
      })
    );

    await waitUntil(
      async () => feature!.getQueueDiagnostics().reconciled > beforeTurnSettledReconciled,
      30_000,
      500
    );

    const [finalStatus, metrics] = await Promise.all([
      feature.getStatus({ teamName, memberName }),
      feature.getMetrics({ teamName }),
    ]);
    const finalReportAccepted =
      (finalStatus.report?.accepted === true &&
        finalStatus.report.state === scenario.expectedState) ||
      hasAcceptedReportForScenario({
        metrics,
        memberName,
        expectedState: scenario.expectedState,
      });
    expect(finalReportAccepted).toBe(true);
    if (finalStatus.state !== 'inactive') {
      expect(finalStatus.state).toBe(scenario.expectedState);
      expect(finalStatus.report).toMatchObject({
        accepted: true,
        state: scenario.expectedState,
      });
    }
    if (scenario.expectedState === 'caught_up') {
      expect(finalStatus.agenda.items).toHaveLength(0);
    } else {
      expect(finalStatus.agenda.items.some((item) => item.taskId === task.id)).toBe(true);
    }
    expect(
      hasAcceptedReportForScenario({
        metrics,
        memberName,
        expectedState: scenario.expectedState,
      })
    ).toBe(true);
    await expect(feature.dispatchDueNudges([teamName])).resolves.toMatchObject({
      claimed: 0,
      delivered: 0,
    });
  }

  it(
    'launches a real Claude teammate, accepts a still-working report, and ingests its Stop hook event',
    async () =>
      runClaudeStopHookLiveScenario({
        markerSuffix: 'lease',
        subjectPrefix: 'Member work sync Claude Stop hook live lease',
        expectedState: 'still_working',
        expectedTaskStatus: 'in_progress',
        expectedMarkerText: (marker) => `${marker}:still-working`,
        buildTaskPromptLines: ({ marker, memberName, teamName, controlUrl }) => [
          `This is a live member-work-sync validation task. Marker: ${marker}.`,
          'Do not edit files and do not complete this task.',
          'Call task_start for this task.',
          `Add one task comment containing exactly: ${marker}:still-working.`,
          `Then call member_work_sync_status with teamName "${teamName}", memberName "${memberName}", and controlUrl "${controlUrl}".`,
          `Then call member_work_sync_report with teamName "${teamName}", memberName "${memberName}", controlUrl "${controlUrl}", state "still_working", the exact agendaFingerprint and reportToken returned by member_work_sync_status, and the current task id if available.`,
          `After that, finish the turn with exactly: ${marker}:hook-settled.`,
        ],
        buildInstructionLines: ({ marker, memberName, teamName, controlUrl, taskId }) => [
          `Live member-work-sync validation instruction. Marker: ${marker}.`,
          `Use the board MCP tools as member "${memberName}" for this validation.`,
          `Call task_get for taskId "${taskId}", then task_start.`,
          `Add one task comment containing exactly: ${marker}:still-working.`,
          `Then call member_work_sync_status with teamName "${teamName}", memberName "${memberName}", and controlUrl "${controlUrl}".`,
          `Then call member_work_sync_report with teamName "${teamName}", memberName "${memberName}", controlUrl "${controlUrl}", state "still_working", the exact agendaFingerprint and reportToken returned by member_work_sync_status, and taskIds ["${taskId}"].`,
          `Do not complete the task. After that, finish the turn with exactly: ${marker}:hook-settled.`,
        ],
      }),
    420_000
  );

  it(
    'launches a real Claude teammate, completes work, reports caught-up, and ingests its Stop hook event',
    async () =>
      runClaudeStopHookLiveScenario({
        markerSuffix: 'caught-up',
        subjectPrefix: 'Member work sync Claude Stop hook live caught-up',
        expectedState: 'caught_up',
        expectedTaskStatus: 'completed',
        expectedMarkerText: (marker) => `${marker}:completed`,
        buildTaskPromptLines: ({ marker, memberName, teamName, controlUrl }) => [
          `This is a live member-work-sync caught-up validation task. Marker: ${marker}.`,
          'Do not edit files.',
          'Call task_start for this task.',
          `Add one task comment containing exactly: ${marker}:completed.`,
          'Then call task_complete for this task.',
          `Then call member_work_sync_status with teamName "${teamName}", memberName "${memberName}", and controlUrl "${controlUrl}".`,
          `Then call member_work_sync_report with teamName "${teamName}", memberName "${memberName}", controlUrl "${controlUrl}", state "caught_up", the exact agendaFingerprint and reportToken returned by member_work_sync_status, and no taskIds.`,
          `After that, finish the turn with exactly: ${marker}:hook-settled.`,
        ],
        buildInstructionLines: ({ marker, memberName, teamName, controlUrl, taskId }) => [
          `Live member-work-sync caught-up validation instruction. Marker: ${marker}.`,
          `Use the board MCP tools as member "${memberName}" for this validation.`,
          `Call task_get for taskId "${taskId}", then task_start.`,
          `Add one task comment containing exactly: ${marker}:completed.`,
          `Call task_complete for taskId "${taskId}".`,
          `Then call member_work_sync_status with teamName "${teamName}", memberName "${memberName}", and controlUrl "${controlUrl}".`,
          `Then call member_work_sync_report with teamName "${teamName}", memberName "${memberName}", controlUrl "${controlUrl}", state "caught_up", the exact agendaFingerprint and reportToken returned by member_work_sync_status, and no taskIds.`,
          `After that, finish the turn with exactly: ${marker}:hook-settled.`,
        ],
      }),
    420_000
  );
});

async function removeTempDirAfterLateShellWrites(tempDir: string): Promise<void> {
  // Claude Code can leave child shells that write ~/.zsh_history just after stopTeam cleanup.
  // Bounded repeated passes keep live tests from leaving tiny recreated HOME directories behind.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

async function cleanupScopedClaudeStopHookLiveTempDirs(): Promise<void> {
  const tmpRoot = os.tmpdir();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let entries: Array<{ isDirectory(): boolean; name: string }>;
    try {
      entries = await fs.readdir(tmpRoot, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('member-work-sync-claude-stop-live-'))
        .map((entry) => fs.rm(path.join(tmpRoot, entry.name), { recursive: true, force: true }))
    );
    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

function hasLiveAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function resolveConnectedClaudeHome(previousHome: string | undefined): string {
  const explicit = process.env.MEMBER_WORK_SYNC_CLAUDE_CONNECTED_HOME?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const previous = previousHome?.trim();
  if (previous) {
    return path.resolve(previous);
  }
  return os.userInfo().homedir;
}
