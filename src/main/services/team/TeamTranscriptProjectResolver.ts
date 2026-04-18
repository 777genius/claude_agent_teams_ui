import { extractCwd } from '@main/utils/jsonl';
import {
  encodePath,
  extractBaseDir,
  getProjectsBasePath,
  getTeamsBasePath,
} from '@main/utils/pathDecoder';
import { atomicWriteAsync } from '@main/utils/atomicWrite';
import { isLeadMember } from '@shared/utils/leadDetection';
import { createLogger } from '@shared/utils/logger';
import { createReadStream, type Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

import { TeamConfigReader } from './TeamConfigReader';

import type { TeamConfig } from '@shared/types';

const logger = createLogger('Service:TeamTranscriptProjectResolver');

const SESSION_DISCOVERY_CACHE_TTL = 30_000;
const TEAM_AFFINITY_SCAN_LINES = 40;
const ROOT_DISCOVERY_CONCURRENCY = 12;

type ProjectEvidenceSource =
  | 'projectPath'
  | 'projectPathHistory'
  | 'leadCwd'
  | 'memberCwd'
  | 'projectsScan';

interface ProjectPathCandidate {
  projectPath: string;
  source: Exclude<ProjectEvidenceSource, 'projectsScan'>;
}

interface ProjectDirCandidate {
  projectPath: string;
  projectDir: string;
  projectId: string;
  source: ProjectEvidenceSource;
}

interface SessionProjectMatch extends ProjectDirCandidate {
  matchedSessionId: string;
}

type ScannedSessionProjectMatch = Omit<SessionProjectMatch, 'projectPath'> & {
  projectPath?: string;
};

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0) {
    const ch = value.charCodeAt(end - 1);
    if (ch === 47 || ch === 92) {
      end -= 1;
      continue;
    }
    break;
  }
  return end === value.length ? value : value.slice(0, end);
}

function isSessionDirectoryName(name: string): boolean {
  return name !== 'memory' && !name.startsWith('.');
}

function normalizeProjectPathCandidate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimTrailingSlashes(trimmed);
}

function extractTextContent(entry: Record<string, unknown>): string | null {
  if (typeof entry.content === 'string') {
    return entry.content;
  }
  if (Array.isArray(entry.content)) {
    const textParts = (entry.content as Record<string, unknown>[])
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text as string);
    if (textParts.length > 0) {
      return textParts.join(' ');
    }
  }
  if (entry.message && typeof entry.message === 'object') {
    return extractTextContent(entry.message as Record<string, unknown>);
  }
  return null;
}

function extractDirectTeamName(entry: Record<string, unknown>): string | null {
  if (typeof entry.teamName === 'string') {
    return entry.teamName.trim().toLowerCase();
  }

  const process = entry.process as Record<string, unknown> | undefined;
  const processTeam = process?.team as Record<string, unknown> | undefined;
  if (typeof processTeam?.teamName === 'string') {
    return processTeam.teamName.trim().toLowerCase();
  }

  return null;
}

function lineMentionsTeam(text: string, teamName: string): boolean {
  const normalizedText = text.trim().toLowerCase();
  const normalizedTeam = teamName.trim().toLowerCase();
  if (!normalizedText.includes(normalizedTeam)) {
    return false;
  }
  return (
    normalizedText.includes(`team name: ${normalizedTeam}`) ||
    normalizedText.includes(`team name "${normalizedTeam}"`) ||
    normalizedText.includes(`team name '${normalizedTeam}'`) ||
    normalizedText.includes(`on team "${normalizedTeam}"`) ||
    normalizedText.includes(`on team '${normalizedTeam}'`) ||
    normalizedText.includes(`team "${normalizedTeam}"`) ||
    normalizedText.includes(`team '${normalizedTeam}'`) ||
    normalizedText.includes(`(${normalizedTeam})`)
  );
}

function entryContainsNestedTeamName(value: unknown, teamName: string, depth: number = 0): boolean {
  if (!value || depth > 8 || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => entryContainsNestedTeamName(item, teamName, depth + 1));
  }

  const entry = value as Record<string, unknown>;
  if (typeof entry.teamName === 'string' && entry.teamName.trim().toLowerCase() === teamName) {
    return true;
  }

  return Object.entries(entry).some(([key, nested]) => {
    if (key === 'teamName') {
      return false;
    }
    return entryContainsNestedTeamName(nested, teamName, depth + 1);
  });
}

function collectKnownSessionIds(config: TeamConfig): string[] {
  const knownSessionIds = new Set<string>();
  const push = (value: unknown): void => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      knownSessionIds.add(trimmed);
    }
  };

  push(config.leadSessionId);
  if (Array.isArray(config.sessionHistory)) {
    for (let index = config.sessionHistory.length - 1; index >= 0; index -= 1) {
      const sessionId = config.sessionHistory[index];
      push(sessionId);
    }
  }

  return [...knownSessionIds];
}

export interface TeamTranscriptProjectContext {
  projectDir: string;
  projectId: string;
  config: TeamConfig;
  sessionIds: string[];
}

export class TeamTranscriptProjectResolver {
  private readonly contextCache = new Map<
    string,
    { value: TeamTranscriptProjectContext; expiresAt: number }
  >();

  constructor(private readonly configReader: TeamConfigReader = new TeamConfigReader()) {}

  async getContext(
    teamName: string,
    options?: { forceRefresh?: boolean }
  ): Promise<TeamTranscriptProjectContext | null> {
    if (options?.forceRefresh) {
      this.contextCache.delete(teamName);
    }

    const cached = this.contextCache.get(teamName);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const config = await this.configReader.getConfig(teamName);
    if (!config) {
      return null;
    }

    const resolution = await this.resolveProjectDirectory(teamName, config);
    if (!resolution) {
      return null;
    }

    const resolvedConfig =
      resolution.effectiveProjectPath &&
      trimTrailingSlashes(resolution.effectiveProjectPath) !==
        trimTrailingSlashes(config.projectPath ?? '')
        ? {
            ...config,
            projectPath: resolution.effectiveProjectPath,
            projectPathHistory: this.buildRepairedProjectPathHistory(
              config,
              resolution.effectiveProjectPath
            ),
          }
        : config;
    const sessionIds = await this.discoverSessionIds(
      teamName,
      resolution.projectDir,
      resolvedConfig
    );
    const value = {
      projectDir: resolution.projectDir,
      projectId: resolution.projectId,
      config: resolvedConfig,
      sessionIds,
    };
    this.contextCache.set(teamName, {
      value,
      expiresAt: Date.now() + SESSION_DISCOVERY_CACHE_TTL,
    });
    return value;
  }

  private async resolveProjectDirectory(
    teamName: string,
    config: TeamConfig
  ): Promise<{ projectDir: string; projectId: string; effectiveProjectPath?: string } | null> {
    const sessionIds = collectKnownSessionIds(config);
    const pathCandidates = this.collectProjectPathCandidates(config);
    const currentCandidate = pathCandidates[0] ?? null;
    if (sessionIds.length === 0) {
      return this.buildFallbackResolution(teamName, pathCandidates);
    }

    const rankBySessionId = new Map(sessionIds.map((sessionId, index) => [sessionId, index]));
    const getMatchRank = (match: { matchedSessionId: string } | null): number =>
      match
        ? (rankBySessionId.get(match.matchedSessionId) ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;

    const toResolution = (
      match: Pick<ProjectDirCandidate, 'projectDir' | 'projectId'> & { projectPath?: string }
    ): { projectDir: string; projectId: string; effectiveProjectPath?: string } => ({
      projectDir: match.projectDir,
      projectId: match.projectId,
      ...(match.projectPath ? { effectiveProjectPath: match.projectPath } : {}),
    });

    let currentMatch: SessionProjectMatch | null = null;
    if (currentCandidate) {
      const resolvedCurrentMatch = await this.findMatchInProjectPathCandidate(
        currentCandidate,
        sessionIds
      );
      if (resolvedCurrentMatch && getMatchRank(resolvedCurrentMatch) === 0) {
        return toResolution(resolvedCurrentMatch);
      }
      if (resolvedCurrentMatch) {
        currentMatch = resolvedCurrentMatch;
      }
    }

    const configuredMatches =
      pathCandidates.length > 1
        ? await this.findMatchesInProjectPathCandidates(pathCandidates.slice(1), sessionIds)
        : [];
    const scannedMatches = await this.findMatchesByScanningProjects(sessionIds);

    const candidateMatchesByProjectDir = new Map<
      string,
      SessionProjectMatch | ScannedSessionProjectMatch
    >();
    for (const match of configuredMatches) {
      if (match.projectDir === currentMatch?.projectDir) {
        continue;
      }
      candidateMatchesByProjectDir.set(match.projectDir, match);
    }
    for (const match of scannedMatches) {
      if (match.projectDir === currentMatch?.projectDir) {
        continue;
      }
      if (!candidateMatchesByProjectDir.has(match.projectDir)) {
        candidateMatchesByProjectDir.set(match.projectDir, match);
      }
    }

    const alternateMatches = [...candidateMatchesByProjectDir.values()];
    const bestAlternateRank = alternateMatches.reduce(
      (best, match) => Math.min(best, getMatchRank(match)),
      Number.POSITIVE_INFINITY
    );
    const currentRank = getMatchRank(currentMatch);

    if (currentMatch && currentRank <= bestAlternateRank) {
      return toResolution(currentMatch);
    }

    if (bestAlternateRank !== Number.POSITIVE_INFINITY) {
      const bestAlternates = alternateMatches.filter(
        (match) => getMatchRank(match) === bestAlternateRank
      );
      if (bestAlternates.length === 1) {
        const winner = bestAlternates[0];
        if (winner.projectPath) {
          await this.persistResolvedProjectPath(teamName, config, winner.projectPath);
        }
        return toResolution(winner);
      }
      logger.warn(
        `[${teamName}] Transcript project resolution ambiguous across exact-session candidates; keeping current path`
      );
      return currentMatch
        ? toResolution(currentMatch)
        : this.buildFallbackResolution(teamName, pathCandidates);
    }

    if (currentMatch) {
      return toResolution(currentMatch);
    }

    return this.buildFallbackResolution(teamName, pathCandidates);
  }

  private async buildFallbackResolution(
    teamName: string,
    candidates: readonly ProjectPathCandidate[]
  ): Promise<{ projectDir: string; projectId: string; effectiveProjectPath?: string } | null> {
    let firstResolution: {
      projectDir: string;
      projectId: string;
      effectiveProjectPath?: string;
    } | null = null;
    let firstExistingResolution: {
      projectDir: string;
      projectId: string;
      effectiveProjectPath?: string;
    } | null = null;

    for (const candidate of candidates) {
      for (const dirCandidate of this.buildProjectDirCandidates(candidate.projectPath)) {
        const resolution = {
          projectDir: dirCandidate.projectDir,
          projectId: dirCandidate.projectId,
          effectiveProjectPath: candidate.projectPath,
        };
        if (!firstResolution) {
          firstResolution = resolution;
        }
        if (!(await this.projectDirExists(dirCandidate.projectDir))) {
          continue;
        }
        if (!firstExistingResolution) {
          firstExistingResolution = resolution;
        }
        const teamRootSessionIds = await this.listTeamRootSessionIds(
          dirCandidate.projectDir,
          teamName
        );
        if (teamRootSessionIds.length > 0) {
          return resolution;
        }
      }
    }

    return firstExistingResolution ?? firstResolution;
  }

  private collectProjectPathCandidates(config: TeamConfig): ProjectPathCandidate[] {
    const candidates: ProjectPathCandidate[] = [];
    const seen = new Set<string>();
    const push = (value: unknown, source: Exclude<ProjectEvidenceSource, 'projectsScan'>): void => {
      const normalized = normalizeProjectPathCandidate(value);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      candidates.push({ projectPath: normalized, source });
    };

    push(config.projectPath, 'projectPath');

    if (Array.isArray(config.projectPathHistory)) {
      for (let index = config.projectPathHistory.length - 1; index >= 0; index -= 1) {
        push(config.projectPathHistory[index], 'projectPathHistory');
      }
    }

    const leadCwd = (config.members ?? []).find((member) => isLeadMember(member))?.cwd;
    push(leadCwd, 'leadCwd');

    const distinctMemberCwds = Array.from(
      new Set(
        (config.members ?? [])
          .map((member) => normalizeProjectPathCandidate(member.cwd))
          .filter((cwd): cwd is string => Boolean(cwd))
      )
    );
    if (distinctMemberCwds.length === 1) {
      push(distinctMemberCwds[0], 'memberCwd');
    }

    return candidates;
  }

  private buildProjectDirCandidates(projectPath: string): ProjectDirCandidate[] {
    const normalizedProjectPath = trimTrailingSlashes(projectPath);
    const projectId = extractBaseDir(encodePath(normalizedProjectPath));
    const baseCandidates = [
      { projectDir: path.join(getProjectsBasePath(), projectId), projectId },
      ...(projectId.includes('_')
        ? [
            {
              projectDir: path.join(getProjectsBasePath(), projectId.replace(/_/g, '-')),
              projectId: projectId.replace(/_/g, '-'),
            },
          ]
        : []),
    ];

    const seen = new Set<string>();
    return baseCandidates
      .filter((candidate) => {
        if (seen.has(candidate.projectDir)) {
          return false;
        }
        seen.add(candidate.projectDir);
        return true;
      })
      .map((candidate) => ({
        projectPath: normalizedProjectPath,
        projectDir: candidate.projectDir,
        projectId: candidate.projectId,
        source: 'projectPath' as const,
      }));
  }

  private async findMatchInProjectPathCandidate(
    candidate: ProjectPathCandidate,
    sessionIds: string[]
  ): Promise<SessionProjectMatch | null> {
    const rankBySessionId = new Map(sessionIds.map((sessionId, index) => [sessionId, index]));
    let bestMatch: SessionProjectMatch | null = null;

    for (const projectCandidate of this.buildProjectDirCandidates(candidate.projectPath)) {
      const matchedSessionId = await this.findMatchingSessionId(
        projectCandidate.projectDir,
        sessionIds
      );
      if (!matchedSessionId) {
        continue;
      }
      const match = {
        ...projectCandidate,
        source: candidate.source,
        matchedSessionId,
      };
      const matchRank = rankBySessionId.get(match.matchedSessionId) ?? Number.POSITIVE_INFINITY;
      const bestRank = bestMatch
        ? (rankBySessionId.get(bestMatch.matchedSessionId) ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      if (!bestMatch || matchRank < bestRank) {
        bestMatch = match;
      }
      if (matchRank === 0) {
        break;
      }
    }
    return bestMatch;
  }

  private async findMatchesInProjectPathCandidates(
    candidates: ProjectPathCandidate[],
    sessionIds: string[]
  ): Promise<SessionProjectMatch[]> {
    const matches: SessionProjectMatch[] = [];
    const seenProjectDirs = new Set<string>();
    for (const candidate of candidates) {
      const match = await this.findMatchInProjectPathCandidate(candidate, sessionIds);
      if (!match || seenProjectDirs.has(match.projectDir)) {
        continue;
      }
      seenProjectDirs.add(match.projectDir);
      matches.push(match);
    }
    return matches;
  }

  private async findMatchingSessionId(
    projectDir: string,
    sessionIds: string[]
  ): Promise<string | null> {
    for (const sessionId of sessionIds) {
      try {
        const stat = await fs.stat(path.join(projectDir, `${sessionId}.jsonl`));
        if (stat.isFile()) {
          return sessionId;
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  private async findMatchesByScanningProjects(
    sessionIds: string[]
  ): Promise<ScannedSessionProjectMatch[]> {
    let projectEntries: Dirent[];
    try {
      projectEntries = await fs.readdir(getProjectsBasePath(), { withFileTypes: true });
    } catch {
      return [];
    }

    const directories = projectEntries.filter((entry) => entry.isDirectory());
    const matches: ScannedSessionProjectMatch[] = [];
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < directories.length) {
        const index = nextIndex++;
        const entry = directories[index];
        const projectDir = path.join(getProjectsBasePath(), entry.name);
        const matchedSessionId = await this.findMatchingSessionId(projectDir, sessionIds);
        if (!matchedSessionId) {
          continue;
        }
        const jsonlPath = path.join(projectDir, `${matchedSessionId}.jsonl`);
        const cwd = await extractCwd(jsonlPath);
        matches.push({
          projectPath: cwd ?? undefined,
          projectDir,
          projectId: entry.name,
          source: 'projectsScan',
          matchedSessionId,
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(ROOT_DISCOVERY_CONCURRENCY, directories.length) }, () =>
        worker()
      )
    );

    const deduped = new Map<string, ScannedSessionProjectMatch>();
    for (const match of matches) {
      if (!deduped.has(match.projectDir)) {
        deduped.set(match.projectDir, match);
      }
    }
    return [...deduped.values()];
  }

  private async persistResolvedProjectPath(
    teamName: string,
    config: TeamConfig,
    nextProjectPath: string
  ): Promise<void> {
    const normalizedNextPath = normalizeProjectPathCandidate(nextProjectPath);
    if (!normalizedNextPath) {
      return;
    }

    const currentProjectPath = normalizeProjectPathCandidate(config.projectPath);
    if (currentProjectPath === normalizedNextPath) {
      return;
    }

    const configPath = path.join(getTeamsBasePath(), teamName, 'config.json');
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const rawProjectPath =
        normalizeProjectPathCandidate(parsed.projectPath) ?? currentProjectPath ?? null;

      parsed.projectPath = normalizedNextPath;

      const history: string[] = [];
      const seen = new Set<string>();
      const pushHistory = (value: unknown): void => {
        const normalized = normalizeProjectPathCandidate(value);
        if (!normalized || normalized === normalizedNextPath || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        history.push(normalized);
      };

      if (Array.isArray(parsed.projectPathHistory)) {
        for (const value of parsed.projectPathHistory) {
          pushHistory(value);
        }
      }
      pushHistory(rawProjectPath);

      parsed.projectPathHistory = history.slice(-500);
      await atomicWriteAsync(configPath, JSON.stringify(parsed, null, 2));
      logger.info(
        `[${teamName}] Repaired transcript projectPath via exact session match: ${normalizedNextPath}`
      );
    } catch (error) {
      logger.warn(
        `[${teamName}] Failed to persist repaired transcript projectPath: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async discoverSessionIds(
    teamName: string,
    projectDir: string,
    config: TeamConfig
  ): Promise<string[]> {
    const knownSessionIds = collectKnownSessionIds(config);
    const [teamRootSessionIds, sessionDirIds] = await Promise.all([
      this.listTeamRootSessionIds(projectDir, teamName),
      this.listSessionDirIds(projectDir),
    ]);

    const orderedSessionIds: string[] = [];
    const seen = new Set<string>();
    const push = (sessionId: string): void => {
      if (seen.has(sessionId)) {
        return;
      }
      seen.add(sessionId);
      orderedSessionIds.push(sessionId);
    };

    for (const sessionId of knownSessionIds) {
      push(sessionId);
    }
    for (const sessionId of [...teamRootSessionIds, ...sessionDirIds].sort((left, right) =>
      left.localeCompare(right)
    )) {
      push(sessionId);
    }

    return orderedSessionIds;
  }

  private buildRepairedProjectPathHistory(config: TeamConfig, nextProjectPath: string): string[] {
    const normalizedNextPath = normalizeProjectPathCandidate(nextProjectPath);
    const history: string[] = [];
    const seen = new Set<string>();
    const pushHistory = (value: unknown): void => {
      const normalized = normalizeProjectPathCandidate(value);
      if (!normalized || normalized === normalizedNextPath || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      history.push(normalized);
    };

    if (Array.isArray(config.projectPathHistory)) {
      for (const value of config.projectPathHistory) {
        pushHistory(value);
      }
    }
    pushHistory(config.projectPath);

    return history.slice(-500);
  }

  private async projectDirExists(projectDir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(projectDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async listSessionDirIds(projectDir: string): Promise<string[]> {
    try {
      const dirEntries = await fs.readdir(projectDir, { withFileTypes: true });
      return dirEntries
        .filter((entry) => entry.isDirectory() && isSessionDirectoryName(entry.name))
        .map((entry) => entry.name);
    } catch {
      logger.debug(`Cannot read transcript project dir: ${projectDir}`);
      return [];
    }
  }

  private async listTeamRootSessionIds(projectDir: string, teamName: string): Promise<string[]> {
    let dirEntries: Dirent[];
    try {
      dirEntries = await fs.readdir(projectDir, { withFileTypes: true });
    } catch {
      logger.debug(`Cannot read transcript project dir: ${projectDir}`);
      return [];
    }

    const rootJsonlEntries = dirEntries.filter(
      (entry) => entry.isFile() && entry.name.endsWith('.jsonl')
    );
    const discovered = new Set<string>();
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < rootJsonlEntries.length) {
        const index = nextIndex++;
        const entry = rootJsonlEntries[index];
        const filePath = path.join(projectDir, entry.name);
        if (!(await this.fileBelongsToTeam(filePath, teamName))) {
          continue;
        }
        discovered.add(entry.name.slice(0, -'.jsonl'.length));
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(ROOT_DISCOVERY_CONCURRENCY, rootJsonlEntries.length) }, () =>
        worker()
      )
    );

    return [...discovered];
  }

  private async fileBelongsToTeam(filePath: string, teamName: string): Promise<boolean> {
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const normalizedTeam = teamName.trim().toLowerCase();

    try {
      let inspected = 0;
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        inspected += 1;
        try {
          const entry = JSON.parse(trimmed) as Record<string, unknown>;
          const directTeamName = extractDirectTeamName(entry);
          if (directTeamName === normalizedTeam) {
            return true;
          }
          if (entryContainsNestedTeamName(entry, normalizedTeam)) {
            return true;
          }

          const textContent = extractTextContent(entry);
          if (textContent && lineMentionsTeam(textContent, normalizedTeam)) {
            return true;
          }
        } catch {
          // ignore malformed head lines
        }

        if (inspected >= TEAM_AFFINITY_SCAN_LINES) {
          break;
        }
      }
    } catch {
      return false;
    } finally {
      rl.close();
      stream.destroy();
    }

    return false;
  }
}
