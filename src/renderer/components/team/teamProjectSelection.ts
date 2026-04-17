import { normalizePath } from '@renderer/utils/pathNormalize';

import type { Project, RepositoryGroup } from '@renderer/types/data';
import type { TeamSummary } from '@shared/types';

export interface ResolveTeamProjectSelectionInput {
  repositoryGroups: readonly RepositoryGroup[];
  projects: readonly Project[];
  selectedRepositoryId: string | null;
  selectedWorktreeId: string | null;
  selectedProjectId: string | null;
  activeProjectId: string | null;
}

export interface ResolvedTeamProjectSelection {
  projectPath: string | null;
  repositoryId: string | null;
  worktreeId: string | null;
  projectId: string | null;
}

export type TeamProjectSelectionTarget =
  | {
      kind: 'grouped';
      repositoryId: string;
      worktreeId: string;
      projectPath: string;
    }
  | {
      kind: 'flat';
      projectId: string;
      projectPath: string;
    };

function findWorktreeSelection(
  repositoryGroups: readonly RepositoryGroup[],
  worktreeId: string
): { repositoryId: string; worktreeId: string; projectPath: string } | null {
  for (const repositoryGroup of repositoryGroups) {
    const worktree = repositoryGroup.worktrees.find((candidate) => candidate.id === worktreeId);
    if (worktree) {
      return {
        repositoryId: repositoryGroup.id,
        worktreeId: worktree.id,
        projectPath: worktree.path,
      };
    }
  }

  return null;
}

export function resolveTeamProjectSelection({
  repositoryGroups,
  projects,
  selectedRepositoryId,
  selectedWorktreeId,
  selectedProjectId,
  activeProjectId,
}: ResolveTeamProjectSelectionInput): ResolvedTeamProjectSelection {
  const effectiveWorktreeId = selectedWorktreeId ?? activeProjectId ?? selectedProjectId ?? null;
  if (effectiveWorktreeId) {
    const worktreeSelection = findWorktreeSelection(repositoryGroups, effectiveWorktreeId);
    if (worktreeSelection) {
      return {
        projectPath: worktreeSelection.projectPath,
        repositoryId: worktreeSelection.repositoryId,
        worktreeId: worktreeSelection.worktreeId,
        projectId: worktreeSelection.worktreeId,
      };
    }
  }

  const effectiveProjectId = activeProjectId ?? selectedProjectId ?? null;
  if (effectiveProjectId) {
    const project = projects.find((candidate) => candidate.id === effectiveProjectId);
    if (project) {
      return {
        projectPath: project.path,
        repositoryId: null,
        worktreeId: null,
        projectId: project.id,
      };
    }
  }

  if (selectedRepositoryId) {
    const repositoryGroup = repositoryGroups.find(
      (candidate) => candidate.id === selectedRepositoryId
    );
    const fallbackWorktree = repositoryGroup?.worktrees[0] ?? null;
    if (fallbackWorktree) {
      return {
        projectPath: fallbackWorktree.path,
        repositoryId: repositoryGroup?.id ?? null,
        worktreeId: fallbackWorktree.id,
        projectId: fallbackWorktree.id,
      };
    }
  }

  return {
    projectPath: null,
    repositoryId: null,
    worktreeId: null,
    projectId: null,
  };
}

export function findTeamProjectSelectionTarget(
  repositoryGroups: readonly RepositoryGroup[],
  projects: readonly Project[],
  projectPath: string
): TeamProjectSelectionTarget | null {
  const normalizedProjectPath = normalizePath(projectPath);

  for (const repositoryGroup of repositoryGroups) {
    const worktree = repositoryGroup.worktrees.find(
      (candidate) => normalizePath(candidate.path) === normalizedProjectPath
    );
    if (worktree) {
      return {
        kind: 'grouped',
        repositoryId: repositoryGroup.id,
        worktreeId: worktree.id,
        projectPath: worktree.path,
      };
    }
  }

  const project = projects.find(
    (candidate) => normalizePath(candidate.path) === normalizedProjectPath
  );
  if (project) {
    return {
      kind: 'flat',
      projectId: project.id,
      projectPath: project.path,
    };
  }

  return null;
}

export function teamMatchesProjectSelection(team: TeamSummary, projectPath: string): boolean {
  const normalizedProjectPath = normalizePath(projectPath);
  if (team.projectPath && normalizePath(team.projectPath) === normalizedProjectPath) {
    return true;
  }

  return (
    team.projectPathHistory?.some(
      (candidate) => normalizePath(candidate) === normalizedProjectPath
    ) ?? false
  );
}
