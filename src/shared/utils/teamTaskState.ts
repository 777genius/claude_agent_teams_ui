export interface TeamTaskStateLike {
  status: string;
  reviewState?: string | null;
  kanbanColumn?: string | null;
  deletedAt?: string | null;
}

export type TeamTaskWorkflowColumn = 'review' | 'approved';

export function isTeamTaskApproved(task: TeamTaskStateLike): boolean {
  if (isTeamTaskDeleted(task) || task.status === 'pending') {
    return false;
  }

  if (task.kanbanColumn === 'approved') {
    return true;
  }

  if (task.kanbanColumn === 'review') {
    return false;
  }

  return task.reviewState === 'approved';
}

export function isTeamTaskDeleted(task: TeamTaskStateLike): boolean {
  return task.status === 'deleted' || Boolean(task.deletedAt);
}

export function isTeamTaskActivelyWorked(task: TeamTaskStateLike): boolean {
  return (
    task.status === 'in_progress' &&
    getTeamTaskWorkflowColumn(task) !== 'review' &&
    !isTeamTaskApproved(task) &&
    !isTeamTaskDeleted(task)
  );
}

export function isTeamTaskNeedsFixActionable(task: TeamTaskStateLike): boolean {
  return (
    task.reviewState === 'needsFix' &&
    !isTeamTaskDeleted(task) &&
    getTeamTaskWorkflowColumn(task) === undefined
  );
}

export function isTeamTaskFinishedForDependency(task: TeamTaskStateLike): boolean {
  const workflowColumn = getTeamTaskWorkflowColumn(task);
  if (workflowColumn === 'approved') {
    return true;
  }
  if (workflowColumn === 'review' || isTeamTaskNeedsFixActionable(task)) {
    return false;
  }
  return task.status === 'completed';
}

export function isTeamTaskTerminalForActionableWork(task: TeamTaskStateLike): boolean {
  if (isTeamTaskDeleted(task)) {
    return true;
  }

  const workflowColumn = getTeamTaskWorkflowColumn(task);
  if (workflowColumn === 'approved') {
    return true;
  }

  if (workflowColumn === 'review' || isTeamTaskNeedsFixActionable(task)) {
    return false;
  }
  return task.status === 'completed';
}

export function isTeamTaskFinalForCompletionNotification(task: TeamTaskStateLike): boolean {
  return isTeamTaskTerminalForActionableWork(task);
}

export function getTeamTaskWorkflowColumn(
  task: TeamTaskStateLike
): TeamTaskWorkflowColumn | undefined {
  if (isTeamTaskDeleted(task) || task.status === 'pending') {
    return undefined;
  }

  if (task.kanbanColumn === 'approved') {
    return 'approved';
  }

  if (task.kanbanColumn === 'review') {
    return 'review';
  }

  if (task.reviewState === 'approved') {
    return 'approved';
  }

  if (task.reviewState === 'review') {
    return 'review';
  }

  return undefined;
}
