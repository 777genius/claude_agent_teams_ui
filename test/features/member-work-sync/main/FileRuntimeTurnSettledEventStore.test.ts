import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { FileRuntimeTurnSettledEventStore } from '@features/member-work-sync/main/infrastructure/FileRuntimeTurnSettledEventStore';
import { RuntimeTurnSettledSpoolPaths } from '@features/member-work-sync/main/infrastructure/RuntimeTurnSettledSpoolPaths';

const roots: string[] = [];

async function makePaths(): Promise<RuntimeTurnSettledSpoolPaths> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-turn-settled-'));
  roots.push(root);
  return new RuntimeTurnSettledSpoolPaths(root);
}

afterEach(async () => {
  await Promise.allSettled(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('FileRuntimeTurnSettledEventStore', () => {
  it('claims incoming payloads by atomically moving them to processing', async () => {
    const paths = await makePaths();
    await fs.mkdir(paths.getIncomingDir(), { recursive: true });
    await fs.writeFile(
      path.join(paths.getIncomingDir(), '20260429-1.claude.json'),
      '{"hook_event_name":"Stop"}',
      'utf8'
    );

    const store = new FileRuntimeTurnSettledEventStore({
      paths,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });

    const claimed = await store.claimPending(10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      fileName: '20260429-1.claude.json',
      provider: 'claude',
      raw: '{"hook_event_name":"Stop"}',
    });
    await expect(
      fs.stat(path.join(paths.getProcessingDir(), '20260429-1.claude.json'))
    ).resolves.toMatchObject({ isFile: expect.any(Function) });
    await expect(
      fs.stat(path.join(paths.getIncomingDir(), '20260429-1.claude.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('moves processed payload and writes diagnostic metadata', async () => {
    const paths = await makePaths();
    await fs.mkdir(paths.getIncomingDir(), { recursive: true });
    await fs.writeFile(
      path.join(paths.getIncomingDir(), '20260429-1.claude.json'),
      '{"hook_event_name":"Stop"}',
      'utf8'
    );
    const store = new FileRuntimeTurnSettledEventStore({
      paths,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });
    const [claimed] = await store.claimPending(1);

    await store.markProcessed(claimed, {
      outcome: 'enqueued',
      teamName: 'team-a',
      memberName: 'alice',
      event: {
        schemaVersion: 1,
        provider: 'claude',
        hookEventName: 'Stop',
        sourceId: 'source-1',
        payloadHash: 'hash',
        recordedAt: '2026-04-29T12:00:00.000Z',
      },
      processedAt: '2026-04-29T12:01:00.000Z',
    });

    const processedPath = path.join(paths.getProcessedDir(), '20260429-1.claude.json');
    await expect(fs.stat(processedPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
    const meta = JSON.parse(await fs.readFile(`${processedPath}.meta.json`, 'utf8')) as {
      outcome?: string;
      teamName?: string;
    };
    expect(meta).toMatchObject({ outcome: 'enqueued', teamName: 'team-a' });
  });
});
