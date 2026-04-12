import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ConfigManager CLAUDE_ROOT support', () => {
  afterEach(async () => {
    vi.resetModules();
    const pathDecoder = await import('../../../../src/main/utils/pathDecoder');
    pathDecoder.setClaudeBasePathOverride(null);
  });

  it('resolves the default config path from the current Claude base path override', async () => {
    vi.resetModules();

    const overrideRoot = path.join(os.tmpdir(), 'claude-root-test');
    const pathDecoder = await import('../../../../src/main/utils/pathDecoder');
    pathDecoder.setClaudeBasePathOverride(overrideRoot);

    const { configManager } = await import(
      '../../../../src/main/services/infrastructure/ConfigManager'
    );

    expect(configManager.getConfigPath()).toBe(
      path.join(overrideRoot, 'claude-devtools-config.json')
    );
  });
});
