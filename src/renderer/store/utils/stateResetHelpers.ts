/**
 * Shared state reset helpers to eliminate duplicated reset blocks across slices.
 *
 * These return partial state objects that can be spread into Zustand `set()` calls.
 */

import type { AppState } from '../types';

/**
 * Reset session-related state (sessions list, detail, pagination, context stats).
 * Used when switching projects, worktrees, or repositories.
 */
export function getSessionResetState(): Partial<AppState> {
  return {
    selectedSessionId: null,
    sessionDetail: null,
    sessionContextStats: null,
    sessions: [],
    sessionsError: null,
    sessionsCursor: null,
    sessionsHasMore: false,
    sessionsTotalCount: 0,
    sessionsLoadingMore: false,
  };
}

/**
 * Atomically navigate to a specific worktree.
 * Use instead of selectRepository() + selectWorktree() to avoid race condition
 * (two competing fetchSessionsInitial calls where the stale response can overwrite).
 */
export function getWorktreeNavigationState(repoId: string, worktreeId: string): Partial<AppState> {
  return {
    selectedRepositoryId: repoId,
    selectedWorktreeId: worktreeId,
    selectedProjectId: worktreeId,
    activeProjectId: worktreeId,
    ...getSessionResetState(),
  };
}

/**
 * Clear the active project/worktree selection without resetting unrelated UI state.
 * Used when a screen wants to remove the current project context entirely.
 */
export function getProjectSelectionResetState(): Partial<AppState> {
  return {
    selectedRepositoryId: null,
    selectedWorktreeId: null,
    selectedProjectId: null,
    activeProjectId: null,
    ...getSessionResetState(),
  };
}

/**
 * Full state reset (session + project + repository + conversation).
 * Used when closing all tabs or resetting to initial state.
 */
export function getFullResetState(): Partial<AppState> {
  return {
    ...getSessionResetState(),
    selectedRepositoryId: null,
    selectedWorktreeId: null,
    selectedProjectId: null,
    activeProjectId: null,
    conversation: null,
    visibleAIGroupId: null,
    selectedAIGroup: null,
    sessionClaudeMdStats: null,
  };
}
