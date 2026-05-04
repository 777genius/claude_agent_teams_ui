import { constants as fsConstants, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readOpenCodeRuntimeLaneIndex } from '../../../../src/main/services/team/opencode/store/OpenCodeRuntimeManifestEvidenceReader';
import {
  getTeamsBasePath,
  setClaudeBasePathOverride,
} from '../../../../src/main/utils/pathDecoder';
import {
  createOpenCodeLiveHarness,
  waitForOpenCodeLanesStopped,
  waitUntil,
  type OpenCodeLiveHarness,
} from './openCodeLiveTestHarness';

import type { TeamProvisioningProgress } from '../../../../src/shared/types';

vi.mock('../../../../src/main/services/infrastructure/NotificationManager', () => ({
  NotificationManager: {
    getInstance: () => ({
      addTeamNotification: vi.fn(async () => undefined),
    }),
  },
}));

const liveDescribe =
  process.env.MIXED_PROVIDER_TEAM_LIVE === '1' &&
  process.env.OPENCODE_E2E === '1' &&
  process.env.OPENCODE_E2E_USE_REAL_APP_CREDENTIALS === '1' &&
  Boolean(process.env.ANTHROPIC_API_KEY?.trim())
    ? describe
    : describe.skip;

const DEFAULT_ORCHESTRATOR_CLI = '/Users/belief/dev/projects/claude/agent_teams_orchestrator/cli';
const DEFAULT_ANTHROPIC_MODEL = 'haiku';
const DEFAULT_CODEX_MODEL = 'gpt-5.4-mini';
const DEFAULT_OPENCODE_MODEL = 'openai/gpt-5.4-mini';

liveDescribe('Mixed provider team launch live e2e', () => {
  let tempDir: string;
  let tempClaudeRoot: string;
  let tempHome: string;
  let projectPath: string;
  let previousCliPath: string | undefined;
  let previousCliFlavor: string | undefined;
  let previousNudgeFlag: string | undefined;
  let previousCodexHome: string | undefined;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;
  let previousNodeEnv: string | undefined;
  let previousDisableAppBootstrap: string | undefined;
  let previousDisableRuntimeBootstrap: string | undefined;
  let harness: OpenCodeLiveHarness | null;
  let teamName: string | null;
  let codexAccountFeature: { getSnapshot(): Promise<unknown>; dispose(): Promise<void> } | null;
  let providerConnectionService: {
    setCodexAccountFeature(feature: { getSnapshot(): Promise<unknown> } | null): void;
  } | null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mixed-provider-team-live-'));
    tempClaudeRoot = path.join(tempDir, '.claude');
    tempHome = path.join(tempDir, 'home');
    projectPath = path.join(tempDir, 'project');
    await fs.mkdir(tempClaudeRoot, { recursive: true });
    await fs.mkdir(tempHome, { recursive: true });
    await fs.mkdir(projectPath, { recursive: true });
    await fs.writeFile(
      path.join(projectPath, 'README.md'),
      '# Mixed provider team live e2e\n\nThis project is intentionally tiny.\n',
      'utf8'
    );
    await writeTrustedClaudeConfig(tempClaudeRoot, projectPath);
    setClaudeBasePathOverride(tempClaudeRoot);

    previousCliPath = process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH;
    previousCliFlavor = process.env.CLAUDE_TEAM_CLI_FLAVOR;
    previousNudgeFlag = process.env.CLAUDE_TEAM_MEMBER_WORK_SYNC_NUDGES_ENABLED;
    previousCodexHome = process.env.CODEX_HOME;
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    previousNodeEnv = process.env.NODE_ENV;
    previousDisableAppBootstrap = process.env.CLAUDE_APP_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;
    previousDisableRuntimeBootstrap = process.env.CLAUDE_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;

    process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH =
      process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH?.trim() || DEFAULT_ORCHESTRATOR_CLI;
    process.env.CLAUDE_TEAM_CLI_FLAVOR = 'agent_teams_orchestrator';
    process.env.CLAUDE_TEAM_MEMBER_WORK_SYNC_NUDGES_ENABLED = '0';
    process.env.CODEX_HOME = resolveConnectedCodexHome(previousCodexHome);
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;
    process.env.NODE_ENV = 'production';
    delete process.env.CLAUDE_APP_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;
    delete process.env.CLAUDE_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP;

    harness = null;
    teamName = null;
    codexAccountFeature = null;
    providerConnectionService = null;
  });

  afterEach(async () => {
    const keepProcesses = process.env.MIXED_PROVIDER_TEAM_LIVE_KEEP_PROCESSES === '1';
    if (!keepProcesses && harness && teamName) {
      await harness.svc.stopTeam(teamName).catch(() => undefined);
      await waitForOpenCodeLanesStopped(teamName, 90_000).catch(() => undefined);
    }
    providerConnectionService?.setCodexAccountFeature(null);
    await codexAccountFeature?.dispose().catch(() => undefined);
    if (!keepProcesses) {
      await harness?.dispose().catch(() => undefined);
    }
    setClaudeBasePathOverride(null);

    restoreEnv('CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH', previousCliPath);
    restoreEnv('CLAUDE_TEAM_CLI_FLAVOR', previousCliFlavor);
    restoreEnv('CLAUDE_TEAM_MEMBER_WORK_SYNC_NUDGES_ENABLED', previousNudgeFlag);
    restoreEnv('CODEX_HOME', previousCodexHome);
    restoreEnv('HOME', previousHome);
    restoreEnv('USERPROFILE', previousUserProfile);
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('CLAUDE_APP_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP', previousDisableAppBootstrap);
    restoreEnv('CLAUDE_DISABLE_DETERMINISTIC_TEAM_BOOTSTRAP', previousDisableRuntimeBootstrap);

    if (process.env.MIXED_PROVIDER_TEAM_LIVE_KEEP_TEMP === '1') {
      process.stderr.write(`[MixedProviderTeamLaunch.live] preserved temp dir: ${tempDir}\n`);
    } else {
      await removeTempDirWithRetries(tempDir);
    }
  }, 180_000);

  it(
    'launches Anthropic, Codex subscription, and OpenCode teammates in one mixed team',
    async () => {
      const orchestratorCli = process.env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH?.trim();
      expect(orchestratorCli).toBeTruthy();
      await assertExecutable(orchestratorCli!);
      await assertExecutable(path.join(process.env.CODEX_HOME!, 'auth.json'));

      const anthropicModel =
        process.env.MIXED_PROVIDER_TEAM_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
      const codexModel = process.env.MIXED_PROVIDER_TEAM_CODEX_MODEL?.trim() || DEFAULT_CODEX_MODEL;
      const codexEffort =
        (process.env.MIXED_PROVIDER_TEAM_CODEX_EFFORT?.trim() as
          | 'low'
          | 'medium'
          | 'high'
          | 'xhigh'
          | undefined) || 'low';
      const openCodeModel =
        process.env.MIXED_PROVIDER_TEAM_OPENCODE_MODEL?.trim() || DEFAULT_OPENCODE_MODEL;

      const [
        { ProviderConnectionService },
        { createCodexAccountFeature },
      ] = await Promise.all([
        import('../../../../src/main/services/runtime/ProviderConnectionService'),
        import('../../../../src/features/codex-account/main/composition/createCodexAccountFeature'),
      ]);

      codexAccountFeature = createCodexAccountFeature({
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
        configManager: {
          getConfig: () => ({
            providerConnections: {
              codex: {
                preferredAuthMode: 'chatgpt' as const,
              },
            },
          }),
        },
      });
      providerConnectionService = ProviderConnectionService.getInstance();
      providerConnectionService.setCodexAccountFeature(codexAccountFeature);

      harness = await createOpenCodeLiveHarness({
        tempDir,
        selectedModel: openCodeModel,
        projectPath,
      });

      teamName = `mixed-provider-live-${Date.now()}`;
      const progressEvents: TeamProvisioningProgress[] = [];

      await harness.svc.createTeam(
        {
          teamName,
          cwd: projectPath,
          providerId: 'anthropic',
          model: anthropicModel,
          skipPermissions: true,
          prompt: 'Keep the team idle after bootstrap. Do not start extra work.',
          members: [
            {
              name: 'alice',
              role: 'Developer',
              providerId: 'anthropic',
              model: anthropicModel,
            },
            {
              name: 'cody',
              role: 'Developer',
              providerId: 'codex',
              model: codexModel,
              effort: codexEffort,
            },
            {
              name: 'oscar',
              role: 'Developer',
              providerId: 'opencode',
              model: openCodeModel,
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
      }, 360_000);

      await waitUntilWithDiagnostics(async () => {
        const status = await harness!.svc.getMemberSpawnStatuses(teamName!);
        if (status.teamLaunchState === 'partial_failure') {
          throw new Error(await formatMixedLaunchDiagnostics(harness!, teamName!, progressEvents));
        }
        for (const memberName of ['alice', 'cody', 'oscar'] as const) {
          const member = status.statuses[memberName];
          if (
            member?.status !== 'online' ||
            member.launchState !== 'confirmed_alive' ||
            member.bootstrapConfirmed !== true
          ) {
            return false;
          }
        }
        return true;
      }, 180_000, () => formatMixedLaunchDiagnostics(harness!, teamName!, progressEvents));

      await waitUntilWithDiagnostics(async () => {
        const snapshot = await harness!.svc.getTeamAgentRuntimeSnapshot(teamName!);
        return (
          snapshot.members.alice?.providerId === 'anthropic' &&
          snapshot.members.alice.alive === true &&
          snapshot.members.cody?.providerId === 'codex' &&
          snapshot.members.cody.alive === true &&
          snapshot.members.oscar?.providerId === 'opencode' &&
          snapshot.members.oscar.alive === true
        );
      }, 180_000, () => formatMixedLaunchDiagnostics(harness!, teamName!, progressEvents));

      const laneIndex = await readOpenCodeRuntimeLaneIndex(getTeamsBasePath(), teamName);
      expect(
        Object.entries(laneIndex.lanes).some(
          ([laneId, lane]) => lane.state === 'active' && laneId === 'secondary:opencode:oscar'
        )
      ).toBe(true);
    },
    480_000
  );
});

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}

async function assertExecutable(filePath: string): Promise<void> {
  await fs.access(filePath, fsConstants.R_OK);
}

async function writeTrustedClaudeConfig(configDir: string, projectPath: string): Promise<void> {
  const normalizedProjectPath = path.normalize(projectPath).replace(/\\/g, '/');
  const approvedApiKeySuffix = process.env.ANTHROPIC_API_KEY?.trim().slice(-20);
  const config: {
    projects: Record<string, { hasTrustDialogAccepted: true }>;
    customApiKeyResponses?: { approved: string[]; rejected: string[] };
  } = {
    projects: {
      [normalizedProjectPath]: {
        hasTrustDialogAccepted: true,
      },
    },
  };
  if (approvedApiKeySuffix) {
    config.customApiKeyResponses = {
      approved: [approvedApiKeySuffix],
      rejected: [],
    };
  }
  await fs.writeFile(
    path.join(configDir, '.claude.json'),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8'
  );
}

function resolveConnectedCodexHome(previousCodexHome: string | undefined): string {
  const explicit = process.env.MIXED_PROVIDER_TEAM_CODEX_HOME?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const previous = previousCodexHome?.trim();
  if (previous) {
    return path.resolve(previous);
  }
  return path.join(os.userInfo().homedir, '.codex');
}

async function removeTempDirWithRetries(dirPath: string): Promise<void> {
  const attempts = process.platform === 'win32' ? 20 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== 'EBUSY' && code !== 'EPERM') || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function formatProgressDump(progressEvents: TeamProvisioningProgress[]): string {
  return redactSecrets(
    progressEvents
      .map((progress) =>
        [
          progress.state,
          progress.message,
          progress.messageSeverity,
          progress.error,
          progress.cliLogsTail,
        ]
          .filter(Boolean)
          .join(' | ')
      )
      .join('\n')
  );
}

function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-api03-[A-Za-z0-9_-]+/g, '<redacted-anthropic-key>')
    .replace(/\b(?:sk|ak)-[A-Za-z0-9_-]{20,}\b/g, '<redacted-api-key>');
}

async function waitUntilWithDiagnostics(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  describeState: () => Promise<string>,
  pollMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.\n${await describeState()}`);
}

async function formatMixedLaunchDiagnostics(
  harness: OpenCodeLiveHarness,
  teamName: string,
  progressEvents: TeamProvisioningProgress[]
): Promise<string> {
  const [spawnStatuses, runtimeSnapshot, laneIndex] = await Promise.all([
    harness.svc.getMemberSpawnStatuses(teamName).catch((error) => ({
      error: String(error),
    })),
    harness.svc.getTeamAgentRuntimeSnapshot(teamName).catch((error) => ({
      error: String(error),
    })),
    readOpenCodeRuntimeLaneIndex(getTeamsBasePath(), teamName).catch((error) => ({
      error: String(error),
    })),
  ]);
  return redactSecrets(
    JSON.stringify(
      {
        progress: formatProgressDump(progressEvents),
        spawnStatuses,
        runtimeSnapshot,
        laneIndex,
      },
      null,
      2
    )
  );
}
