import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildNativeAppManagedBootstrapSpecs,
  hashNativeBootstrapText,
} from '../../../../src/main/services/team/bootstrap/NativeAppManagedBootstrapContextBuilder';
import { TeamMembersMetaStore } from '../../../../src/main/services/team/TeamMembersMetaStore';
import { TeamMetaStore } from '../../../../src/main/services/team/TeamMetaStore';
import { setClaudeBasePathOverride } from '../../../../src/main/utils/pathDecoder';

describe('NativeAppManagedBootstrapContextBuilder', () => {
  let tempClaudeRoot = '';

  beforeEach(async () => {
    tempClaudeRoot = await mkdtemp(join(tmpdir(), 'native-bootstrap-builder-'));
    setClaudeBasePathOverride(tempClaudeRoot);
  });

  afterEach(async () => {
    setClaudeBasePathOverride(null);
    await rm(tempClaudeRoot, { recursive: true, force: true });
  });

  it('canonical hash normalizes line endings and trailing whitespace', () => {
    expect(hashNativeBootstrapText('line 1\r\nline 2  \n')).toBe(
      hashNativeBootstrapText('line 1\nline 2')
    );
  });

  it('builds bounded redacted context for native providers and skips non-native providers', async () => {
    await new TeamMetaStore().writeMeta('native-ready-team', {
      cwd: '/tmp/workspace',
      providerId: 'anthropic',
      model: 'claude-opus-4-6',
      createdAt: Date.now(),
    });
    await new TeamMembersMetaStore().writeMembers('native-ready-team', [
      {
        name: 'alice',
        providerId: 'anthropic',
        role: 'Reviewer ANTHROPIC_API_KEY=sk-ant-secret',
      },
      {
        name: 'bob',
        providerId: 'codex',
        role: 'Developer Bearer secret-token',
      },
      {
        name: 'zoe',
        providerId: 'gemini',
        role: 'Gemini member',
      },
      {
        name: 'tom',
        providerId: 'opencode',
        role: 'OpenCode member',
      },
    ]);

    const specs = await buildNativeAppManagedBootstrapSpecs({
      teamName: 'native-ready-team',
      cwd: '/tmp/workspace',
      members: [
        {
          name: 'alice',
          providerId: 'anthropic',
          role: 'Reviewer ANTHROPIC_API_KEY=sk-ant-secret',
        },
        {
          name: 'bob',
          providerId: 'codex',
          role: 'Developer Bearer secret-token',
        },
        {
          name: 'zoe',
          providerId: 'gemini',
          role: 'Gemini member',
        },
        {
          name: 'tom',
          providerId: 'opencode',
          role: 'OpenCode member',
        },
      ],
    });

    expect([...specs.keys()].sort()).toEqual(['alice', 'bob']);
    const alice = specs.get('alice');
    const bob = specs.get('bob');
    expect(alice?.contextText).toContain('<agent_teams_native_bootstrap_context>');
    expect(alice?.contextText).not.toContain('sk-ant-secret');
    expect(alice?.contextText).toContain('ANTHROPIC_API_KEY=[REDACTED]');
    expect(bob?.contextText).not.toContain('Bearer secret-token');
    expect(bob?.contextText).toContain('Bearer [REDACTED]');
    expect(alice?.contextHash).toBe(hashNativeBootstrapText(alice?.contextText ?? ''));
  });

  it('fails closed when aggregate native context budget is exceeded', async () => {
    const hugeRole = 'x'.repeat(40_000);
    await new TeamMetaStore().writeMeta('large-native-team', {
      cwd: '/tmp/workspace',
      providerId: 'anthropic',
      model: 'claude-opus-4-6',
      createdAt: Date.now(),
    });
    await new TeamMembersMetaStore().writeMembers(
      'large-native-team',
      Array.from({ length: 8 }, (_, index) => ({
        name: `member-${index}`,
        providerId: 'anthropic' as const,
        role: hugeRole,
      }))
    );

    await expect(
      buildNativeAppManagedBootstrapSpecs({
        teamName: 'large-native-team',
        cwd: '/tmp/workspace',
        members: Array.from({ length: 8 }, (_, index) => ({
          name: `member-${index}`,
          providerId: 'anthropic' as const,
          role: hugeRole,
        })),
      })
    ).rejects.toThrow(/aggregate size budget/);
  });
});
