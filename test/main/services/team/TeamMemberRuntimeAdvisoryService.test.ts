import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import * as fs from 'fs/promises';

import { TeamMemberRuntimeAdvisoryService } from '../../../../src/main/services/team/TeamMemberRuntimeAdvisoryService';
import { setClaudeBasePathOverride } from '../../../../src/main/utils/pathDecoder';

describe('TeamMemberRuntimeAdvisoryService', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    setClaudeBasePathOverride(null);
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('returns active sdk retry advisory for a teammate log', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-team-advisory-'));
    setClaudeBasePathOverride(tmpDir);

    const teamName = 'signal-ops';
    const projectPath = '/Users/test/proj';
    const projectId = '-Users-test-proj';
    const leadSessionId = 'lead-session';

    await fs.mkdir(path.join(tmpDir, 'teams', teamName), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'teams', teamName, 'config.json'),
      JSON.stringify({
        name: teamName,
        projectPath,
        leadSessionId,
        members: [
          { name: 'team-lead', agentType: 'team-lead' },
          { name: 'alice', agentType: 'general-purpose' },
        ],
      }),
      'utf8'
    );

    const projectRoot = path.join(tmpDir, 'projects', projectId);
    await fs.mkdir(path.join(projectRoot, leadSessionId, 'subagents'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, `${leadSessionId}.jsonl`),
      `${JSON.stringify({
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'user',
        message: { role: 'user', content: 'Start' },
      })}\n`,
      'utf8'
    );

    const nowIso = new Date().toISOString();
    await fs.writeFile(
      path.join(projectRoot, leadSessionId, 'subagents', 'agent-alice.jsonl'),
      [
        JSON.stringify({
          timestamp: nowIso,
          type: 'user',
          message: { role: 'user', content: 'You are alice, a reviewer on team "signal-ops" (signal-ops).' },
        }),
        JSON.stringify({
          timestamp: nowIso,
          type: 'system',
          subtype: 'api_error',
          retryInMs: 45_000,
          retryAttempt: 1,
          maxRetries: 10,
          error: {
            error: {
              error: {
                message: 'Gemini cli backend error: capacity exceeded.',
              },
            },
          },
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    const service = new TeamMemberRuntimeAdvisoryService();
    const advisory = await service.getMemberAdvisory(teamName, 'alice');

    expect(advisory).not.toBeNull();
    expect(advisory?.kind).toBe('sdk_retrying');
    expect(advisory?.message).toContain('capacity exceeded');
  });

  it('ignores expired retry advisories', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-team-advisory-'));
    setClaudeBasePathOverride(tmpDir);

    const teamName = 'signal-ops';
    const projectPath = '/Users/test/proj';
    const projectId = '-Users-test-proj';
    const leadSessionId = 'lead-session';

    await fs.mkdir(path.join(tmpDir, 'teams', teamName), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'teams', teamName, 'config.json'),
      JSON.stringify({
        name: teamName,
        projectPath,
        leadSessionId,
        members: [
          { name: 'team-lead', agentType: 'team-lead' },
          { name: 'alice', agentType: 'general-purpose' },
        ],
      }),
      'utf8'
    );

    const projectRoot = path.join(tmpDir, 'projects', projectId);
    await fs.mkdir(path.join(projectRoot, leadSessionId, 'subagents'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, `${leadSessionId}.jsonl`),
      `${JSON.stringify({
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'user',
        message: { role: 'user', content: 'Start' },
      })}\n`,
      'utf8'
    );

    await fs.writeFile(
      path.join(projectRoot, leadSessionId, 'subagents', 'agent-alice.jsonl'),
      [
        JSON.stringify({
          timestamp: new Date(Date.now() - 60_000).toISOString(),
          type: 'user',
          message: { role: 'user', content: 'You are alice, a reviewer on team "signal-ops" (signal-ops).' },
        }),
        JSON.stringify({
          timestamp: new Date(Date.now() - 60_000).toISOString(),
          type: 'system',
          subtype: 'api_error',
          retryInMs: 5_000,
          retryAttempt: 1,
          maxRetries: 10,
          error: {
            error: {
              error: {
                message: 'Old retry window',
              },
            },
          },
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    const service = new TeamMemberRuntimeAdvisoryService();
    await expect(service.getMemberAdvisory(teamName, 'alice')).resolves.toBeNull();
  });
});
