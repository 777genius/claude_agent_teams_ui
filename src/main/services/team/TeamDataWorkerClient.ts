/**
 * Main-thread client for team-data-worker.
 *
 * Proxies getTeamData and findLogsForTask calls to a worker thread
 * so they don't block the Electron main event loop.
 * Falls back to main-thread execution if the worker is unavailable.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { createLogger } from '@shared/utils/logger';

import type { MemberLogSummary, TeamData } from '@shared/types';
import type { TeamDataWorkerRequest, TeamDataWorkerResponse } from './teamDataWorkerTypes';

const logger = createLogger('Service:TeamDataWorkerClient');
const WORKER_CALL_TIMEOUT_MS = 30_000;
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/;

function makeId(): string {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 12)}`;
}

function resolveWorkerPath(): string | null {
  const baseDir =
    typeof __dirname === 'string' && __dirname.length > 0
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));

  const candidates = [
    path.join(baseDir, 'team-data-worker.cjs'),
    path.join(process.cwd(), 'dist-electron', 'main', 'team-data-worker.cjs'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  logger.warn('team-data-worker not found in expected locations');
  return null;
}

type PendingEntry = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

export class TeamDataWorkerClient {
  private worker: Worker | null = null;
  private readonly workerPath: string | null = resolveWorkerPath();
  private warnedUnavailable = false;
  private pending = new Map<string, PendingEntry>();

  isAvailable(): boolean {
    if (!this.workerPath && !this.warnedUnavailable) {
      this.warnedUnavailable = true;
      logger.warn('team-data-worker not found; falling back to main-thread execution');
    }
    return this.workerPath !== null;
  }

  private ensureWorker(): Worker {
    if (!this.workerPath) throw new Error('Worker not available');
    if (this.worker) return this.worker;

    const w = new Worker(this.workerPath);
    this.worker = w;

    w.on('message', (msg: TeamDataWorkerResponse) => {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.ok) {
        entry.resolve(msg.result);
      } else {
        entry.reject(new Error(msg.error));
      }
    });

    // Scope error/exit handlers to this specific worker instance.
    // Without this guard, a stale worker's exit event can reject
    // pending requests that belong to a newer replacement worker.
    w.on('error', (err) => {
      if (this.worker !== w) return;
      logger.error('Worker error', err);
      for (const [, entry] of this.pending) {
        entry.reject(err instanceof Error ? err : new Error(String(err)));
      }
      this.pending.clear();
      this.worker = null;
    });

    w.on('exit', (code) => {
      if (this.worker !== w) return;
      if (code !== 0) logger.warn(`Worker exited with code ${code}`);
      for (const [, entry] of this.pending) {
        entry.reject(new Error(`Worker exited with code ${code}`));
      }
      this.pending.clear();
      this.worker = null;
    });

    return w;
  }

  private call(
    op: TeamDataWorkerRequest['op'],
    payload: TeamDataWorkerRequest['payload']
  ): Promise<unknown> {
    const worker = this.ensureWorker();
    const id = makeId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        this.worker?.terminate().catch(() => undefined);
        this.worker = null;
        reject(new Error(`Worker call timeout after ${WORKER_CALL_TIMEOUT_MS}ms`));
      }, WORKER_CALL_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      worker.postMessage({ id, op, payload } as TeamDataWorkerRequest);
    });
  }

  async getTeamData(teamName: string): Promise<TeamData> {
    if (!SAFE_NAME_RE.test(teamName)) throw new Error('Invalid teamName');
    return this.call('getTeamData', { teamName }) as Promise<TeamData>;
  }

  async findLogsForTask(
    teamName: string,
    taskId: string,
    options?: {
      owner?: string;
      status?: string;
      intervals?: { startedAt: string; completedAt?: string }[];
      since?: string;
    }
  ): Promise<MemberLogSummary[]> {
    if (!SAFE_NAME_RE.test(teamName)) throw new Error('Invalid teamName');
    if (!SAFE_ID_RE.test(taskId)) throw new Error('Invalid taskId');
    return this.call('findLogsForTask', { teamName, taskId, options }) as Promise<
      MemberLogSummary[]
    >;
  }

  dispose(): void {
    this.worker?.terminate().catch(() => undefined);
    this.worker = null;
    for (const [, entry] of this.pending) {
      entry.reject(new Error('Client disposed'));
    }
    this.pending.clear();
  }
}

// Singleton
let singleton: TeamDataWorkerClient | null = null;
export function getTeamDataWorkerClient(): TeamDataWorkerClient {
  if (!singleton) singleton = new TeamDataWorkerClient();
  return singleton;
}
