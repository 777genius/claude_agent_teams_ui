import type { TeamReviewState } from '@shared/types';

interface ReviewStateLike {
  reviewState?: TeamReviewState | null;
  kanbanColumn?: 'review' | 'approved' | null;
  status?: string | null;
}

export function normalizeReviewState(value: unknown): TeamReviewState {
  return value === 'review' || value === 'needsFix' || value === 'approved' ? value : 'none';
}

export function getReviewStateFromTask(task: ReviewStateLike): TeamReviewState {
  const explicit = normalizeReviewState(task.reviewState);
  if (explicit !== 'none') {
    return explicit;
  }

  if (task.kanbanColumn === 'review' || task.kanbanColumn === 'approved') {
    return task.kanbanColumn;
  }

  return 'none';
}

export function getKanbanColumnFromReviewState(
  reviewState: TeamReviewState
): 'review' | 'approved' | undefined {
  return reviewState === 'review' || reviewState === 'approved' ? reviewState : undefined;
}

export function getTaskKanbanColumn(task: ReviewStateLike): 'review' | 'approved' | undefined {
  return getKanbanColumnFromReviewState(getReviewStateFromTask(task));
}

export function isApprovedTask(task: ReviewStateLike): boolean {
  return getReviewStateFromTask(task) === 'approved';
}

export function isReviewTask(task: ReviewStateLike): boolean {
  return getReviewStateFromTask(task) === 'review';
}

export function isNeedsFixTask(task: ReviewStateLike): boolean {
  return getReviewStateFromTask(task) === 'needsFix';
}
