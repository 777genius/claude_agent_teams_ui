import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { normalizeIdentityPath } from '@features/recent-projects/main/infrastructure/identity/normalizeIdentityPath';
import { isEphemeralProjectPath } from '@shared/utils/ephemeralProjectPath';

import type { LoggerPort } from '@features/recent-projects/core/application/ports/LoggerPort';
import type {
  RecentProjectsSourcePort,
  RecentProjectsSourceResult,
} from '@features/recent-projects/core/application/ports/RecentProjectsSourcePort';
import type { RecentProjectCandidate } from '@features/recent-projects/core/domain/models/RecentProjectCandidate';
import type { RecentProjectIdentityResolver } from '@features/recent-projects/main/infrastructure/identity/RecentProjectIdentityResolver';
import type { ServiceContext } from '@main/services';

const CODEX_SESSION_FILE_PARSE_LIMIT = 500;
const CODEX_PROJECT_CANDIDATE_LIMIT = 40;
const CODEX_SESSION_FILE_SOURCE_TIMEOUT_MS = 3_500;
const CODEX_SESSION_FILE_READ_BATCH_SIZE = 24;

interface CodexSessionFileEntry {
  filePath: string;
  mtimeMs: number;
}

interface CodexSessionEvent {
  timestamp?: unknown;
  payload?: {
    cwd?: unknown;
    source?: unknown;
    timestamp?: unknown;
    git?: {
      branch?: unknown;
    } | null;
  };
}

interface CodexSessionProjectSnapshot {
  cwd: string;
  source: unknown;
  lastActivityAt: number;
  branchName?: string;
}

function isInteractiveSource(source: unknown): boolean {
  return source === 'vscode' || source === 'cli';
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function getCodexHome(codexHome?: string): string {
  return codexHome?.trim() || process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
}

async function readFirstLine(filePath: string): Promise<string | null> {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of lines) {
      return line;
    }
    return null;
  } catch {
    return null;
  } finally {
    lines.close();
    stream.destroy();
  }
}

async function listJsonlFiles(root: string, maxDepth: number): Promise<CodexSessionFileEntry[]> {
  async function walk(directory: string, depth: number): Promise<CodexSessionFileEntry[]> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return [];
    }

    const files = await Promise.all(
      entries.map(async (entry): Promise<CodexSessionFileEntry[]> => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          return depth < maxDepth ? walk(entryPath, depth + 1) : [];
        }

        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
          return [];
        }

        try {
          const stats = await fs.stat(entryPath);
          return [
            {
              filePath: entryPath,
              mtimeMs: stats.mtimeMs,
            },
          ];
        } catch {
          return [];
        }
      })
    );

    return files.flat();
  }

  return walk(root, 0);
}

function parseSessionSnapshot(
  firstLine: string,
  mtimeMs: number
): CodexSessionProjectSnapshot | null {
  let event: CodexSessionEvent;
  try {
    event = JSON.parse(firstLine) as CodexSessionEvent;
  } catch {
    return null;
  }

  const cwd = typeof event.payload?.cwd === 'string' ? event.payload.cwd.trim() : '';
  if (!cwd || !isInteractiveSource(event.payload?.source) || isEphemeralProjectPath(cwd)) {
    return null;
  }

  const timestamp =
    mtimeMs || normalizeTimestamp(event.payload?.timestamp) || normalizeTimestamp(event.timestamp);
  const branchName =
    typeof event.payload?.git?.branch === 'string' ? event.payload.git.branch.trim() : '';

  return {
    cwd,
    source: event.payload?.source,
    lastActivityAt: timestamp,
    branchName: branchName || undefined,
  };
}

export class CodexSessionFileRecentProjectsSourceAdapter implements RecentProjectsSourcePort {
  readonly sourceId = 'codex-session-files';
  readonly timeoutMs = CODEX_SESSION_FILE_SOURCE_TIMEOUT_MS;
  readonly #codexHome: string;

  constructor(
    private readonly deps: {
      getActiveContext: () => ServiceContext;
      getLocalContext: () => ServiceContext | undefined;
      identityResolver: RecentProjectIdentityResolver;
      logger: LoggerPort;
      codexHome?: string;
    }
  ) {
    this.#codexHome = getCodexHome(deps.codexHome);
  }

  async list(): Promise<RecentProjectsSourceResult> {
    const activeContext = this.deps.getActiveContext();
    const localContext = this.deps.getLocalContext();

    if (activeContext.type !== 'local' || activeContext.id !== localContext?.id) {
      return {
        candidates: [],
        degraded: false,
      };
    }

    try {
      const snapshots = await this.#listRecentSessionSnapshots();
      const candidates = await Promise.all(
        snapshots.map((snapshot) => this.#toCandidate(snapshot))
      );

      const validCandidates = candidates.filter(
        (candidate): candidate is RecentProjectCandidate => candidate !== null
      );

      this.deps.logger.info('codex session-file recent-projects source loaded', {
        count: validCandidates.length,
        codexHome: this.#codexHome,
      });

      return {
        candidates: validCandidates,
        degraded: false,
      };
    } catch (error) {
      this.deps.logger.warn('codex session-file recent-projects source failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        candidates: [],
        degraded: true,
      };
    }
  }

  async #listRecentSessionSnapshots(): Promise<CodexSessionProjectSnapshot[]> {
    const files = [
      ...(await listJsonlFiles(path.join(this.#codexHome, 'sessions'), 4)),
      ...(await listJsonlFiles(path.join(this.#codexHome, 'archived_sessions'), 1)),
    ].sort((left, right) => right.mtimeMs - left.mtimeMs);

    const snapshotsByCwd = new Map<string, CodexSessionProjectSnapshot>();

    const candidateFiles = files.slice(0, CODEX_SESSION_FILE_PARSE_LIMIT);

    for (
      let offset = 0;
      offset < candidateFiles.length && snapshotsByCwd.size < CODEX_PROJECT_CANDIDATE_LIMIT;
      offset += CODEX_SESSION_FILE_READ_BATCH_SIZE
    ) {
      const batch = candidateFiles.slice(offset, offset + CODEX_SESSION_FILE_READ_BATCH_SIZE);
      const firstLines = await Promise.all(
        batch.map(async (file) => ({
          file,
          firstLine: await readFirstLine(file.filePath),
        }))
      );

      for (const { file, firstLine } of firstLines) {
        if (!firstLine) {
          continue;
        }

        const snapshot = parseSessionSnapshot(firstLine, file.mtimeMs);
        if (!snapshot) {
          continue;
        }

        const previous = snapshotsByCwd.get(snapshot.cwd);
        if (!previous || snapshot.lastActivityAt > previous.lastActivityAt) {
          snapshotsByCwd.set(snapshot.cwd, snapshot);
        }

        if (snapshotsByCwd.size >= CODEX_PROJECT_CANDIDATE_LIMIT) {
          break;
        }
      }
    }

    return Array.from(snapshotsByCwd.values())
      .sort((left, right) => right.lastActivityAt - left.lastActivityAt)
      .slice(0, CODEX_PROJECT_CANDIDATE_LIMIT);
  }

  async #toCandidate(
    snapshot: CodexSessionProjectSnapshot
  ): Promise<RecentProjectCandidate | null> {
    const identity = await this.deps.identityResolver.resolve(snapshot.cwd);
    const displayName = identity?.name ?? path.basename(snapshot.cwd) ?? snapshot.cwd;

    return {
      identity: identity?.id ?? `path:${normalizeIdentityPath(snapshot.cwd)}`,
      displayName,
      primaryPath: snapshot.cwd,
      associatedPaths: [snapshot.cwd],
      lastActivityAt: snapshot.lastActivityAt,
      providerIds: ['codex'],
      sourceKind: 'codex',
      openTarget: {
        type: 'synthetic-path',
        path: snapshot.cwd,
      },
      branchName: snapshot.branchName,
    };
  }
}
