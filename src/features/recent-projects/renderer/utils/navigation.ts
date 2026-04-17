import { normalizePath } from '@renderer/utils/pathNormalize';

import type { RepositoryGroup } from '@renderer/types/data';

export interface WorktreeMatch {
  repoId: string;
  worktreeId: string;
}

export function findMatchingWorktree(
  groups: RepositoryGroup[],
  candidatePaths: readonly string[]
): WorktreeMatch | null {
  const normalizedPaths = new Set(candidatePaths.map((projectPath) => normalizePath(projectPath)));

  for (const repo of groups) {
    for (const worktree of repo.worktrees) {
      if (normalizedPaths.has(normalizePath(worktree.path))) {
        return { repoId: repo.id, worktreeId: worktree.id };
      }
    }
  }

  return null;
}

export function buildSyntheticRepositoryGroup(selectedPath: string): RepositoryGroup {
  const encodedId = selectedPath.replace(/[/\\]/g, '-');
  const folderName = selectedPath.split(/[/\\]/).filter(Boolean).pop() ?? selectedPath;
  const now = Date.now();

  return {
    id: encodedId,
    identity: null,
    worktrees: [
      {
        id: encodedId,
        path: selectedPath,
        name: folderName,
        isMainWorktree: true,
        source: 'unknown',
        sessions: [],
        totalSessions: 0,
        createdAt: now,
      },
    ],
    name: folderName,
    mostRecentSession: undefined,
    totalSessions: 0,
  };
}
