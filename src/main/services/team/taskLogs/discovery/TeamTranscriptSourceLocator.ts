import { createLogger } from '@shared/utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

import { TeamTranscriptProjectResolver } from '../../TeamTranscriptProjectResolver';

import type { TeamConfig } from '@shared/types';

const logger = createLogger('Service:TeamTranscriptSourceLocator');
const TRANSCRIPT_DISCOVERY_WARN_MS = 3_000;
const TRANSCRIPT_DISCOVERY_FILE_COUNT_WARN = 500;
const TRANSCRIPT_DISCOVERY_SESSION_CONCURRENCY = process.platform === 'win32' ? 4 : 8;

export interface TeamTranscriptSourceContext {
  projectDir: string;
  projectId: string;
  config: TeamConfig;
  sessionIds: string[];
  transcriptFiles: string[];
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = new Array(workerCount).fill(0).map(async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await fn(items[currentIndex]);
    }
  });
  await Promise.all(workers);
  return results;
}

export class TeamTranscriptSourceLocator {
  constructor(
    private readonly projectResolver: TeamTranscriptProjectResolver = new TeamTranscriptProjectResolver()
  ) {}

  async getContext(teamName: string): Promise<TeamTranscriptSourceContext | null> {
    const context = await this.projectResolver.getContext(teamName);
    if (!context) {
      return null;
    }

    const { projectDir, projectId, config, sessionIds } = context;
    const startedAt = Date.now();
    const transcriptFiles = await this.listTranscriptFilesForSessions(projectDir, sessionIds);
    const elapsedMs = Date.now() - startedAt;
    if (
      elapsedMs >= TRANSCRIPT_DISCOVERY_WARN_MS ||
      transcriptFiles.length >= TRANSCRIPT_DISCOVERY_FILE_COUNT_WARN
    ) {
      logger.warn(
        `Large task-log transcript discovery: team=${teamName} sessions=${sessionIds.length} files=${transcriptFiles.length} elapsedMs=${elapsedMs}`
      );
    }
    return { projectDir, projectId, config, sessionIds, transcriptFiles };
  }

  async listTranscriptFiles(teamName: string): Promise<string[]> {
    const context = await this.getContext(teamName);
    return context?.transcriptFiles ?? [];
  }
  private async listTranscriptFilesForSessions(
    projectDir: string,
    sessionIds: string[]
  ): Promise<string[]> {
    const transcriptFiles = new Set<string>();

    const filesBySession = await mapLimit(
      sessionIds,
      TRANSCRIPT_DISCOVERY_SESSION_CONCURRENCY,
      async (sessionId) => {
        const sessionFiles: string[] = [];
        const mainTranscript = path.join(projectDir, `${sessionId}.jsonl`);
        try {
          const stat = await fs.stat(mainTranscript);
          if (stat.isFile()) {
            sessionFiles.push(mainTranscript);
          }
        } catch {
          // ignore missing root transcript
        }

        const subagentsDir = path.join(projectDir, sessionId, 'subagents');
        try {
          const dirEntries = await fs.readdir(subagentsDir, { withFileTypes: true });
          for (const entry of dirEntries) {
            if (!entry.isFile()) continue;
            if (!entry.name.endsWith('.jsonl')) continue;
            if (!entry.name.startsWith('agent-')) continue;
            if (entry.name.startsWith('agent-acompact')) continue;
            sessionFiles.push(path.join(subagentsDir, entry.name));
          }
        } catch {
          // ignore missing subagent dir
        }
        return sessionFiles;
      }
    );

    for (const sessionFiles of filesBySession) {
      for (const filePath of sessionFiles) {
        transcriptFiles.add(filePath);
      }
    }

    return [...transcriptFiles].sort((left, right) => left.localeCompare(right));
  }
}
