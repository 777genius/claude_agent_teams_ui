import * as fs from 'fs/promises';

import type { MemberRuntimeAdvisory, ResolvedTeamMember } from '@shared/types';

import { TeamMemberLogsFinder } from './TeamMemberLogsFinder';

const LOOKBACK_MS = 10 * 60 * 1000;
const CACHE_TTL_MS = 5_000;
const TAIL_BYTES = 64 * 1024;

interface CachedRuntimeAdvisory {
  value: MemberRuntimeAdvisory | null;
  expiresAt: number;
}

export class TeamMemberRuntimeAdvisoryService {
  private readonly cache = new Map<string, CachedRuntimeAdvisory>();

  constructor(private readonly logsFinder: TeamMemberLogsFinder = new TeamMemberLogsFinder()) {}

  async getMemberAdvisories(
    teamName: string,
    members: readonly Pick<ResolvedTeamMember, 'name' | 'removedAt'>[]
  ): Promise<Map<string, MemberRuntimeAdvisory>> {
    const advisoryEntries = await Promise.all(
      members
        .filter((member) => !member.removedAt)
        .map(async (member) => {
          const advisory = await this.getMemberAdvisory(teamName, member.name);
          return advisory ? ([member.name, advisory] as const) : null;
        })
    );

    return new Map(
      advisoryEntries.filter(
        (entry): entry is readonly [string, MemberRuntimeAdvisory] => entry !== null
      )
    );
  }

  async getMemberAdvisory(
    teamName: string,
    memberName: string
  ): Promise<MemberRuntimeAdvisory | null> {
    const cacheKey = `${teamName.toLowerCase()}::${memberName.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const advisory = await this.findRecentMemberAdvisory(teamName, memberName);
    this.cache.set(cacheKey, {
      value: advisory,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return advisory;
  }

  private async findRecentMemberAdvisory(
    teamName: string,
    memberName: string
  ): Promise<MemberRuntimeAdvisory | null> {
    const summaries = await this.logsFinder.findMemberLogs(
      teamName,
      memberName,
      Date.now() - LOOKBACK_MS
    );
    for (const summary of summaries) {
      if (!summary.filePath) {
        continue;
      }
      const advisory = await this.readRecentApiRetryAdvisory(summary.filePath);
      if (advisory) {
        return advisory;
      }
    }
    return null;
  }

  private async readRecentApiRetryAdvisory(
    filePath: string
  ): Promise<MemberRuntimeAdvisory | null> {
    let handle: fs.FileHandle | null = null;
    try {
      handle = await fs.open(filePath, 'r');
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size <= 0) {
        return null;
      }
      const start = Math.max(0, stat.size - TAIL_BYTES);
      const buffer = Buffer.alloc(stat.size - start);
      if (buffer.length === 0) {
        return null;
      }
      await handle.read(buffer, 0, buffer.length, start);
      const tail = buffer.toString('utf8');
      const lines = tail.split('\n');
      if (start > 0) {
        lines.shift();
      }
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const advisory = this.extractApiRetryAdvisory(lines[index]?.trim() ?? '');
        if (advisory) {
          return advisory;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  private extractApiRetryAdvisory(line: string): MemberRuntimeAdvisory | null {
    if (
      !line ||
      (!line.includes('"subtype":"api_error"') && !line.includes('"subtype": "api_error"'))
    ) {
      return null;
    }

    try {
      const parsed = JSON.parse(line) as {
        type?: string;
        subtype?: string;
        retryInMs?: number;
        timestamp?: string;
        error?: {
          message?: string;
          error?: {
            message?: string;
            error?: {
              message?: string;
            };
          };
        };
      };

      if (parsed.type !== 'system' || parsed.subtype !== 'api_error') {
        return null;
      }

      const retryInMs =
        typeof parsed.retryInMs === 'number' &&
        Number.isFinite(parsed.retryInMs) &&
        parsed.retryInMs > 0
          ? parsed.retryInMs
          : null;
      const observedAt =
        typeof parsed.timestamp === 'string' ? Date.parse(parsed.timestamp) : Number.NaN;
      if (!retryInMs || !Number.isFinite(observedAt)) {
        return null;
      }

      const retryUntil = observedAt + retryInMs;
      if (retryUntil <= Date.now()) {
        return null;
      }

      const message =
        parsed.error?.error?.error?.message?.trim() ||
        parsed.error?.error?.message?.trim() ||
        parsed.error?.message?.trim() ||
        undefined;

      return {
        kind: 'sdk_retrying',
        observedAt: new Date(observedAt).toISOString(),
        retryUntil: new Date(retryUntil).toISOString(),
        retryDelayMs: retryInMs,
        ...(message ? { message } : {}),
      };
    } catch {
      return null;
    }
  }
}
