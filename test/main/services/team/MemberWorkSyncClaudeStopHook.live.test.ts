import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const liveDescribe =
  process.env.MEMBER_WORK_SYNC_CLAUDE_STOP_HOOK_LIVE === '1' &&
  Boolean(process.env.ANTHROPIC_API_KEY?.trim())
    ? describe
    : describe.skip;

const DEFAULT_ORCHESTRATOR_CLI = '/Users/belief/dev/projects/claude/agent_teams_orchestrator/cli';
const DEFAULT_MODEL = 'haiku';

liveDescribe('Member work sync Claude Stop hook live e2e', () => {
  let tempDir: string;
  let tempClaudeRoot: string;
  let tempHome: string;
  let previousCliPath: string | undefined;
  let previousCliFlavor: string | undefined;
  let previousControlUrl: string | undefined;
  let previousNudgeFlag: string | undefined;
  let previousDisableAppBootstrap: string | undefined;
  let previousDisableRuntimeBootstrap: string | undefined;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;
  let svc: TeamProvisioningService | null;
  let feature: MemberWorkSyncFeatureFacade | null;
  let controlServer: MemberWorkSyncLiveControlServer | null;
  let teamName: string | null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'member-work-sync-claude-stop-live-'));
    tempClaudeRoot = path.join(tempDir, '.claude');
    tempHome = path.join(tempDir, 'home');
    await fs.mkdir(tempClaudeRoot, { recursive: true });
    await fs.mkdir(tempHome, { recursive: true });
    setClaudeBasePathOverride(tempClaudeRoot);

    previousCliPath = process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH;
    previousCliFlavor = process.env.CLAUDE_TEAM_CLI_FLAVOR;
    previousControlUrl = process.env.CLAUDE_TEAM_CONTROL_URL;
    previousNudgeFlag = process.env.CLAUDE_TEAM_MEMBER_WORK_SYNC_NUDGES_ENABLED;
    previousDisableAppBootstrap = process.env.CLAUDE_APP_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;
    previousDisableRuntimeBootstrap = process.env.CLAUDE_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;

    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;
    process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH =
      process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH?.trim() || DEFAULT_ORCHESTRATOR_CLI;
    process.env.CLAUDE_TEAM_CLI_FLAVOR = 'agent_teams_orchestrator';
    process.env.CLAUDE_TEAM_MEMBER_WORK_SYNC_NUDGES_ENABLED = '0';
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
    restoreEnv('CLAUDE_TEAM_MEMBER_WORK_SYNC_NUDGES_ENABLED', previousNudgeFlag);
    restoreEnv('CLAUDE_APP_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP', previousDisableAppBootstrap);
    restoreEnv('CLAUDE_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP', previousDisableRuntimeBootstrap);
    restoreEnv('HOME', previousHome);
    restoreEnv('USERPROFILE', previousUserProfile);
    setClaudeBasePathOverride(null);
    if (process.env.MEMBER_WORK_SYNC_CLAUDE_KEEP_TEMP === '1') {
      console.info(`[MemberWorkSyncClaudeStopHook.live] preserved temp dir: ${tempDir}`);
    } else {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it(
    'launches a real Claude teammate, accepts its work-sync report, and ingests its Stop hook event',
    async () => {
      const orchestratorCli = process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH?.trim();
      expect(orchestratorCli).toBeTruthy();
      await assertExecutable(orchestratorCli!);

      const model = process.env.MEMBER_WORK_SYNC_CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
      const marker = `member-work-sync-claude-stop-live-${Date.now()}`;
      const memberName = 'alice';
      teamName = `member-work-sync-claude-stop-${Date.now()}`;
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
      feature = createMemberWorkSyncFeature({
        teamsBasePath: getTeamsBasePath(),
        configReader: new TeamConfigReader(),
        taskReader: new TeamTaskReader(),
        kanbanManager: new TeamKanbanManager(),
        membersMetaStore: new TeamMembersMetaStore(),
        isTeamActive: (name) =>
          activeService.isTeamAlive(name) || activeService.hasProvisioningRun(name),
        listLifecycleActiveTeamNames: async () => [teamName!],
        nudgeSideEffectsEnabled: false,
        queueQuietWindowMs: 500,
      });
      activeService.setTeamChangeEmitter((event: TeamChangeEvent) =>
        feature!.noteTeamChange(event)
      );
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
          skipPermissions: true,
          prompt: [
            'Keep launch work minimal.',
            'If you receive a task, follow task instructions exactly.',
            'Before going idle with unfinished assigned work, call member_work_sync_status and member_work_sync_report.',
          ].join(' '),
          members: [
            {
              name: memberName,
              role: 'Developer',
              providerId: 'anthropic',
              model,
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

      await expect(
        fs.stat(
          path.join(
            getTeamsBasePath(),
            '.member-work-sync/runtime-hooks/bin/turn-settled-hook-v1.sh'
          )
        )
      ).resolves.toMatchObject({ mode: expect.any(Number) });

      const task = await teamDataService.createTask(teamName, {
        subject: `Member work sync Claude Stop hook live lease ${marker}`,
        owner: memberName,
        startImmediately: true,
        prompt: [
          `This is a live member-work-sync validation task. Marker: ${marker}.`,
          'Do not edit files and do not complete this task.',
          'Call task_start for this task.',
          `Add one task comment containing exactly: ${marker}:still-working.`,
          `Then call member_work_sync_status with teamName "${teamName}", memberName "${memberName}", and controlUrl "${controlServer.baseUrl}".`,
          `Then call member_work_sync_report with teamName "${teamName}", memberName "${memberName}", controlUrl "${controlServer.baseUrl}", state "still_working", the exact agendaFingerprint and reportToken returned by member_work_sync_status, and the current task id if available.`,
          'After that stop. Do not send a user-visible message.',
        ].join('\n'),
      });
      feature.noteTeamChange({ type: 'task', teamName, taskId: task.id });
      const relay = await activeService.relayInboxFileToLiveRecipient(teamName, memberName);
      expect(relay.relayed).toBeGreaterThan(0);

      await waitUntil(async () => {
        const status = await feature!.getStatus({ teamName: teamName!, memberName });
        return (
          status.memberName === memberName &&
          status.providerId === 'anthropic' &&
          status.agenda.items.some((item) => item.taskId === task.id) &&
          status.shadow?.wouldNudge === true
        );
      }, 30_000);

      await waitUntil(async () => {
        await feature!.replayPendingReports([teamName!]);
        const status = await feature!.getStatus({ teamName: teamName!, memberName });
        if (status.report?.accepted && status.report.state === 'still_working') {
          return true;
        }
        const tasks = await new TeamTaskReader().getTasks(teamName!);
        const currentTask = tasks.find((candidate) => candidate.id === task.id);
        const hasMarkerComment = currentTask?.comments?.some((comment) =>
          comment.text.includes(`${marker}:still-working`)
        );
        return Boolean(hasMarkerComment && status.report?.accepted);
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
        await feature!.drainRuntimeTurnSettledEvents();
        const metas = await readRuntimeTurnSettledProcessedMetas(getTeamsBasePath());
        return metas.some(({ meta }) => {
          const event = meta.event as Record<string, unknown> | undefined;
          return (
            meta.outcome === 'enqueued' &&
            meta.teamName === teamName &&
            meta.memberName === memberName &&
            event?.provider === 'claude'
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
      expect(finalStatus.state).toBe('still_working');
      expect(finalStatus.report).toMatchObject({
        accepted: true,
        state: 'still_working',
      });
      expect(metrics.recentEvents.some((event) => event.kind === 'report_accepted')).toBe(true);
      await expect(feature.dispatchDueNudges([teamName])).resolves.toMatchObject({
        claimed: 0,
        delivered: 0,
      });
    },
    420_000
  );
});
