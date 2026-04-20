import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { BoardTaskExactLogStrictParser } from '../../../../src/main/services/team/taskLogs/exact/BoardTaskExactLogStrictParser';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (dirPath) => {
      await fs.rm(dirPath, { recursive: true, force: true });
    }),
  );
});

describe('BoardTaskExactLogStrictParser', () => {
  it('drops malformed timestamp rows instead of assigning them synthetic time', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exact-log-parser-'));
    tempDirs.push(tempDir);

    const filePath = path.join(tempDir, 'session.jsonl');
    await fs.writeFile(
      filePath,
      [
        JSON.stringify({
          uuid: 'bad-ts',
          type: 'assistant',
          timestamp: 'not-a-real-date',
          message: { role: 'assistant', content: 'bad row' },
        }),
        JSON.stringify({
          uuid: 'good-ts',
          type: 'assistant',
          timestamp: '2026-04-12T18:00:00.000Z',
          message: { role: 'assistant', content: 'good row' },
        }),
      ].join('\n'),
      'utf8',
    );

    const parsed = await new BoardTaskExactLogStrictParser().parseFiles([filePath]);

    expect(parsed.get(filePath)?.map((message) => message.uuid)).toEqual(['good-ts']);
  });

  it('preserves codex-native replay and history authority rows for exact-log readers', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exact-log-parser-native-'));
    tempDirs.push(tempDir);

    const filePath = path.join(tempDir, 'native-session.jsonl');
    await fs.writeFile(
      filePath,
      [
        JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          userType: 'external',
          cwd: '/tmp/project',
          sessionId: 'session-native-ephemeral',
          version: '1.0.0',
          gitBranch: 'main',
          type: 'system',
          uuid: 'native-warning-1',
          timestamp: '2026-04-19T10:00:00.000Z',
          subtype: 'codex_native_warning',
          level: 'warning',
          isMeta: false,
          content: 'thread/read failed while backfilling turn items for turn completion',
          codexNativeWarningSource: 'history',
        }),
        JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          userType: 'external',
          cwd: '/tmp/project',
          sessionId: 'session-native-ephemeral',
          version: '1.0.0',
          gitBranch: 'main',
          type: 'system',
          uuid: 'native-summary-ephemeral',
          timestamp: '2026-04-19T10:00:01.000Z',
          subtype: 'codex_native_execution_summary',
          level: 'info',
          isMeta: false,
          content:
            'Codex native execution summary: thread=thread-ephemeral, completion=ephemeral, history=live-only, usageAuthority=live-turn-completed, binary=codex-cli 0.117.0',
          codexNativeThreadId: 'thread-ephemeral',
          codexNativeCompletionPolicy: 'ephemeral',
          codexNativeHistoryCompleteness: 'live-only',
          codexNativeFinalUsageAuthority: 'live-turn-completed',
          codexNativeExecutableSource: 'system-path',
          codexNativeExecutableVersion: 'codex-cli 0.117.0',
        }),
        JSON.stringify({
          parentUuid: null,
          isSidechain: false,
          userType: 'external',
          cwd: '/tmp/project',
          sessionId: 'session-native-persistent',
          version: '1.0.0',
          gitBranch: 'main',
          type: 'system',
          uuid: 'native-summary-persistent',
          timestamp: '2026-04-19T10:00:02.000Z',
          subtype: 'codex_native_execution_summary',
          level: 'info',
          isMeta: false,
          content:
            'Codex native execution summary: thread=thread-persistent, completion=persistent, history=explicit-hydration-required, usageAuthority=live-turn-completed, binary=codex-cli 0.117.0',
          codexNativeThreadId: 'thread-persistent',
          codexNativeCompletionPolicy: 'persistent',
          codexNativeHistoryCompleteness: 'explicit-hydration-required',
          codexNativeFinalUsageAuthority: 'live-turn-completed',
          codexNativeExecutableSource: 'system-path',
          codexNativeExecutableVersion: 'codex-cli 0.117.0',
        }),
      ].join('\n'),
      'utf8',
    );

    const parsed = await new BoardTaskExactLogStrictParser().parseFiles([filePath]);

    expect(parsed.get(filePath)).toMatchObject([
      {
        uuid: 'native-warning-1',
        subtype: 'codex_native_warning',
        codexNativeWarningSource: 'history',
      },
      {
        uuid: 'native-summary-ephemeral',
        subtype: 'codex_native_execution_summary',
        codexNativeCompletionPolicy: 'ephemeral',
        codexNativeHistoryCompleteness: 'live-only',
      },
      {
        uuid: 'native-summary-persistent',
        subtype: 'codex_native_execution_summary',
        codexNativeCompletionPolicy: 'persistent',
        codexNativeHistoryCompleteness: 'explicit-hydration-required',
      },
    ]);
  });
});
