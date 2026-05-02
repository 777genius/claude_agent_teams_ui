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

import type { TeamDataWorkerRequest, TeamDataWorkerResponse } from './teamDataWorkerTypes';
import type {
  MemberLogSummary,
  MessagesPage,
  TeamMemberActivityMeta,
  TeamViewSnapshot,
} from '@shared/types';

const logger = createLogger('Service:TeamDataWorkerClient');
const WORKER_CALL_TIMEOUT_MS = 30_000;
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/;

function makeId(): string {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 12)}`;
}

function getWorkerPathCandidates(): string[] {
  const baseDir =
    typeof __dirname === 'string' && __dirname.length > 0
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));

  return [
    path.join(baseDir, 'team-data-worker.cjs'),
    path.join(process.cwd(), 'dist-electron', 'main', 'team-data-worker.cjs'),
  ];
}

function resolveWorkerPath(): string | null {
  const candidates = getWorkerPathCandidates();

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  // Don't warn here — resolveWorkerPath runs at module load time and
  // the worker file is expected to be absent during tests.
  // isAvailable() warns once on first access instead.
  return null;
}

interface PendingEntry {
  resolve: (v: unknown, diag?: Extract<TeamDataWorkerResponse, { ok: true }>['diag']) => void;
  reject: (e: Error) => void;
}

function summarizeWorkerPayload(
  payload: TeamDataWorkerRequest['payload']
): Record<string, unknown> {
  if ('taskId' in payload) {
    return {
      teamName: payload.teamName,
      taskId: payload.taskId,
      owner: payload.options?.owner,
      status: payload.options?.status,
      intervals: Array.isArray(payload.options?.intervals)
        ? payload.options.intervals.length
        : undefined,
      since: payload.options?.since,
    };
  }
  if ('options' in payload) {
    return {
      teamName: payload.teamName,
      cursor:
        typeof payload.options.cursor === 'string'
          ? payload.options.cursor.slice(0, 24)
          : payload.options.cursor,
      limit: payload.options.limit,
    };
  }
  if ('teamName' in payload) {
    return {
      teamName: payload.teamName,
    };
  }
  return {};
}

export class TeamDataWorkerClient {
  private worker: Worker | null = null;
  private readonly workerPath: string | null = resolveWorkerPath();
  private warnedUnavailable = false;
  private pending = new Map<string, PendingEntry>();
  private getTeamDataInFlight = new Map<string, Promise<TeamViewSnapshot>>();
  private getMessagesPageInFlight = new Map<string, Promise<MessagesPage>>();

  private failWorker(worker: Worker, error: Error): void {
    if (this.worker !== worker) return;

    this.worker = null;
    const pendingEntries = Array.from(this.pending.values());
    this.pending.clear();

    for (const entry of pendingEntries) {
      entry.reject(error);
    }
  }

  isAvailable(): boolean {
    if (!this.workerPath && !this.warnedUnavailable) {
      this.warnedUnavailable = true;
      logger.warn(
        `team-data-worker not found; heavy team data paths may fall back to main-thread execution. expectedOneOf=${getWorkerPathCandidates().join(',')}`
      );
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
        entry.resolve(msg.result, msg.diag);
      } else {
        entry.reject(new Error(msg.error));
      }
    });

    // Scope error/exit handlers to this specific worker instance.
    // Without this guard, a stale worker's exit event can reject
    // pending requests that belong to a newer replacement worker.
    w.on('error', (err) => {
      logger.error('Worker error', err);
      this.failWorker(w, err instanceof Error ? err : new Error(String(err)));
    });

    w.on('exit', (code) => {
      if (code !== 0) logger.warn(`Worker exited with code ${code}`);
      this.failWorker(w, new Error(`Worker exited with code ${code}`));
    });

    return w;
  }

  private call(
    op: TeamDataWorkerRequest['op'],
    payload: TeamDataWorkerRequest['payload']
  ): Promise<unknown> {
    const worker = this.ensureWorker();
    const id = makeId();
    const startedAt = Date.now();
    const pendingAtStart = this.pending.size;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const timeoutError = new Error(`Worker call timeout after ${WORKER_CALL_TIMEOUT_MS}ms`);
        logger.warn(
          `worker call timeout op=${op} ms=${Date.now() - startedAt} pendingAtStart=${pendingAtStart} pendingNow=${this.pending.size} payload=${JSON.stringify(
            summarizeWorkerPayload(payload)
          )}`
        );
        this.failWorker(worker, timeoutError);
        worker.terminate().catch(() => undefined);
        reject(timeoutError);
      }, WORKER_CALL_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (value, diag) => {
          clearTimeout(timeout);
          const ms = Date.now() - startedAt;
          if (ms >= 1500) {
            logger.warn(
              `worker call slow op=${op} ms=${ms} workerTotalMs=${String(diag?.totalMs ?? 'unknown')} pendingAtStart=${pendingAtStart} pendingNow=${this.pending.size} payload=${JSON.stringify(
                summarizeWorkerPayload(payload)
              )}`
            );
          }
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          const ms = Date.now() - startedAt;
          if (ms >= 1500) {
            logger.warn(
              `worker call failed slow op=${op} ms=${ms} pendingAtStart=${pendingAtStart} pendingNow=${this.pending.size} payload=${JSON.stringify(
                summarizeWorkerPayload(payload)
              )} error=${error.message}`
            );
          }
          reject(error);
        },
      });

      worker.postMessage({ id, op, payload } as TeamDataWorkerRequest);
    });
  }

  private postBestEffort(
    op: TeamDataWorkerRequest['op'],
    payload: TeamDataWorkerRequest['payload']
  ): void {
    const worker = this.worker;
    if (!worker) return;
    try {
      worker.postMessage({ id: makeId(), op, payload } as TeamDataWorkerRequest);
    } catch (error) {
      logger.debug(
        `worker best-effort post failed op=${op} payload=${JSON.stringify(
          summarizeWorkerPayload(payload)
        )} error=${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getTeamData(teamName: string): Promise<TeamViewSnapshot> {
    if (!SAFE_NAME_RE.test(teamName)) throw new Error('Invalid teamName');
    const existing = this.getTeamDataInFlight.get(teamName);
    if (existing) return existing;

    const promise = (this.call('getTeamData', { teamName }) as Promise<TeamViewSnapshot>).finally(
      () => {
        if (this.getTeamDataInFlight.get(teamName) === promise) {
          this.getTeamDataInFlight.delete(teamName);
        }
      }
    );
    this.getTeamDataInFlight.set(teamName, promise);
    return promise;
  }

  invalidateTeamConfig(teamName: string): void {
    if (!SAFE_NAME_RE.test(teamName)) return;
    this.getTeamDataInFlight.delete(teamName);
    this.clearMessagesPageInFlightForTeam(teamName);
    this.postBestEffort('invalidateTeamConfig', { teamName });
  }

  invalidateTeamMessageFeed(teamName: string): void {
    if (!SAFE_NAME_RE.test(teamName)) return;
    this.clearMessagesPageInFlightForTeam(teamName);
    this.postBestEffort('invalidateTeamMessageFeed', { teamName });
  }

  private clearMessagesPageInFlightForTeam(teamName: string): void {
    const prefix = `{"teamName":"${teamName}",`;
    for (const key of this.getMessagesPageInFlight.keys()) {
      if (key.startsWith(prefix)) {
        this.getMessagesPageInFlight.delete(key);
      }
    }
  }

  async getMessagesPage(
    teamName: string,
    options: { cursor?: string | null; limit: number }
  ): Promise<MessagesPage> {
    if (!SAFE_NAME_RE.test(teamName)) throw new Error('Invalid teamName');
    const key = JSON.stringify({
      teamName,
      cursor: options.cursor ?? null,
      limit: options.limit,
    });
    const existing = this.getMessagesPageInFlight.get(key);
    if (existing) return existing;

    const promise = (
      this.call('getMessagesPage', {
        teamName,
        options,
      }) as Promise<MessagesPage>
    ).finally(() => {
      if (this.getMessagesPageInFlight.get(key) === promise) {
        this.getMessagesPageInFlight.delete(key);
      }
    });
    this.getMessagesPageInFlight.set(key, promise);
    return promise;
  }

  async getMemberActivityMeta(teamName: string): Promise<TeamMemberActivityMeta> {
    if (!SAFE_NAME_RE.test(teamName)) throw new Error('Invalid teamName');
    return this.call('getMemberActivityMeta', { teamName }) as Promise<TeamMemberActivityMeta>;
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
    this.getTeamDataInFlight.clear();
    this.getMessagesPageInFlight.clear();
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
