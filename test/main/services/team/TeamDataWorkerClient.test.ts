import { afterEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const workers: Array<{
    messages: unknown[];
    handlers: Map<string, (value: unknown) => void>;
    postMessage: (message: unknown) => void;
    on: (event: string, handler: (value: unknown) => void) => void;
    terminate: () => Promise<void>;
  }> = [];
  const createMockWorker = vi.fn().mockImplementation(() => {
    const worker = {
      messages: [] as unknown[],
      handlers: new Map<string, (value: unknown) => void>(),
      postMessage(message: unknown) {
        worker.messages.push(message);
        const request = message as { id: string; op: string; payload?: { teamName?: string } };
        queueMicrotask(() => {
          const handler = worker.handlers.get('message');
          if (!handler) return;
          handler({
            id: request.id,
            ok: true,
            result:
              request.op === 'getTeamData'
                ? { teamName: request.payload?.teamName, config: { name: 'Team' } }
                : null,
          });
        });
      },
      on(event: string, handler: (value: unknown) => void) {
        worker.handlers.set(event, handler);
      },
      terminate: vi.fn(async () => undefined),
    };
    workers.push(worker);
    return worker;
  });
  return {
    workers,
    createMockWorker,
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

vi.mock('node:worker_threads', () => ({
  Worker: hoisted.createMockWorker,
  default: {
    Worker: hoisted.createMockWorker,
  },
}));

describe('TeamDataWorkerClient', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.workers.length = 0;
  });

  it('deduplicates concurrent getTeamData calls for the same team', async () => {
    const { TeamDataWorkerClient } = await import(
      '../../../../src/main/services/team/TeamDataWorkerClient'
    );
    const client = new TeamDataWorkerClient();

    const [first, second] = await Promise.all([
      client.getTeamData('my-team'),
      client.getTeamData('my-team'),
    ]);

    expect(first).toEqual(second);
    expect(hoisted.workers).toHaveLength(1);
    expect(hoisted.workers[0].messages).toHaveLength(1);
    expect(hoisted.workers[0].messages[0]).toMatchObject({
      op: 'getTeamData',
      payload: { teamName: 'my-team' },
    });

    client.dispose();
  });

  it('sends best-effort team config invalidation to the worker', async () => {
    const { TeamDataWorkerClient } = await import(
      '../../../../src/main/services/team/TeamDataWorkerClient'
    );
    const client = new TeamDataWorkerClient();
    await client.getTeamData('my-team');
    hoisted.workers[0].messages.length = 0;

    client.invalidateTeamConfig('my-team');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hoisted.workers).toHaveLength(1);
    expect(hoisted.workers[0].messages).toHaveLength(1);
    expect(hoisted.workers[0].messages[0]).toMatchObject({
      op: 'invalidateTeamConfig',
      payload: { teamName: 'my-team' },
    });

    client.dispose();
  });

  it('clears in-flight getTeamData dedupe when invalidating team config', async () => {
    const { TeamDataWorkerClient } = await import(
      '../../../../src/main/services/team/TeamDataWorkerClient'
    );
    const client = new TeamDataWorkerClient();

    const first = client.getTeamData('my-team');
    client.invalidateTeamConfig('my-team');
    const second = client.getTeamData('my-team');

    await Promise.all([first, second]);

    expect(hoisted.workers).toHaveLength(1);
    expect(hoisted.workers[0].messages.map((message) => (message as { op: string }).op)).toEqual([
      'getTeamData',
      'invalidateTeamConfig',
      'getTeamData',
    ]);

    client.dispose();
  });

  it('does not spawn a worker only to send config invalidation', async () => {
    const { TeamDataWorkerClient } = await import(
      '../../../../src/main/services/team/TeamDataWorkerClient'
    );
    const client = new TeamDataWorkerClient();

    client.invalidateTeamConfig('my-team');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hoisted.workers).toHaveLength(0);
  });
});
