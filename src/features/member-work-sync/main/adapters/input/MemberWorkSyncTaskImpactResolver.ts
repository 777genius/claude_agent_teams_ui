import { isLeadMember } from '@shared/utils/leadDetection';

import { normalizeMemberName, resolveCurrentReviewOwner } from '../../../core/domain';

import type { TeamKanbanManager } from '@main/services/team/TeamKanbanManager';
import type { TeamTaskReader } from '@main/services/team/TeamTaskReader';
import type { TeamTask } from '@shared/types';

export interface MemberWorkSyncTaskImpactResolverDeps {
  taskReader: Pick<TeamTaskReader, 'getTasks'>;
  kanbanManager: Pick<TeamKanbanManager, 'getState'>;
  activeMemberSource: {
    loadActiveMemberNames(teamName: string): Promise<string[]>;
  };
}

export interface MemberWorkSyncTaskImpactResolverResult {
  memberNames: string[];
  fallbackTeamWide: boolean;
  diagnostics: string[];
}

function isTerminalTask(task: Pick<TeamTask, 'status' | 'deletedAt'>): boolean {
  return task.status === 'completed' || task.status === 'deleted' || Boolean(task.deletedAt);
}

function isDeletedTask(task: Pick<TeamTask, 'status' | 'deletedAt'>): boolean {
  return task.status === 'deleted' || Boolean(task.deletedAt);
}

function taskMatchesId(task: TeamTask, taskId: string): boolean {
  const normalized = taskId.trim().replace(/^#/, '');
  return (
    task.id === taskId ||
    task.id === normalized ||
    task.displayId === taskId ||
    task.displayId === normalized ||
    task.displayId === `#${normalized}`
  );
}

function taskReferenceKeys(task: Pick<TeamTask, 'id' | 'displayId'>): string[] {
  const keys = [task.id, task.displayId]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(keys.flatMap((value) => [value, value.replace(/^#/, '')]))];
}

function findLeadMemberName(activeMembers: string[]): string | null {
  return activeMembers.find((memberName) => isLeadMember({ name: memberName })) ?? null;
}

export function extractMemberWorkSyncTaskId(input: {
  taskId?: string;
  detail?: string;
}): string | null {
  const explicit = input.taskId?.trim();
  if (explicit) {
    return explicit;
  }

  const detail = input.detail?.trim();
  if (!detail || detail.startsWith('.') || !detail.endsWith('.json')) {
    return null;
  }

  const fileName = detail.split(/[\\/]/).filter(Boolean).at(-1);
  const taskId = fileName?.replace(/\.json$/i, '').trim();
  return taskId && !taskId.startsWith('.') ? taskId : null;
}

export class MemberWorkSyncTaskImpactResolver {
  constructor(private readonly deps: MemberWorkSyncTaskImpactResolverDeps) {}

  async resolve(input: {
    teamName: string;
    taskId: string;
  }): Promise<MemberWorkSyncTaskImpactResolverResult> {
    const taskId = input.taskId.trim();
    if (!taskId) {
      return {
        memberNames: [],
        fallbackTeamWide: true,
        diagnostics: ['task_id_missing'],
      };
    }

    const [activeMembers, tasks, kanban] = await Promise.all([
      this.deps.activeMemberSource.loadActiveMemberNames(input.teamName),
      this.deps.taskReader.getTasks(input.teamName),
      this.deps.kanbanManager.getState(input.teamName),
    ]);
    const activeByName = new Map(
      activeMembers.map((memberName) => [normalizeMemberName(memberName), memberName] as const)
    );
    const impacted = new Set<string>();
    const diagnostics: string[] = [];
    const addDiagnostic = (diagnostic: string): void => {
      if (!diagnostics.includes(diagnostic)) {
        diagnostics.push(diagnostic);
      }
    };
    const addMember = (value: unknown): void => {
      const normalized = normalizeMemberName(value);
      const activeName = activeByName.get(normalized);
      if (activeName) {
        impacted.add(activeName);
      }
    };
    const addLead = (): void => {
      const leadName = findLeadMemberName(activeMembers);
      if (leadName) {
        impacted.add(leadName);
      } else {
        addDiagnostic('lead_member_unavailable');
      }
    };

    const task = tasks.find((candidate) => taskMatchesId(candidate, taskId));
    if (!task) {
      return {
        memberNames: [],
        fallbackTeamWide: true,
        diagnostics: ['task_not_found'],
      };
    }

    addMember(task.owner);

    const reviewOwner = resolveCurrentReviewOwner({
      reviewState: task.reviewState,
      kanbanReviewer: kanban.tasks[task.id]?.reviewer ?? null,
      historyEvents: task.historyEvents,
    });
    addMember(reviewOwner?.reviewer);

    if (!normalizeMemberName(task.owner)) {
      addLead();
      addDiagnostic('task_owner_missing');
    } else if (!activeByName.has(normalizeMemberName(task.owner))) {
      addLead();
      addDiagnostic('task_owner_inactive');
    }

    if (task.reviewState === 'review' && !reviewOwner?.reviewer) {
      addLead();
      addDiagnostic('task_reviewer_missing');
    }

    if (task.needsClarification === 'lead') {
      addLead();
    }

    const tasksByReference = new Map(
      tasks.flatMap((candidate) =>
        taskReferenceKeys(candidate).map((key) => [key, candidate] as const)
      )
    );
    const brokenDependencies = (task.blockedBy ?? []).filter((dependencyId) => {
      const dependency = tasksByReference.get(dependencyId);
      return !dependency || isDeletedTask(dependency);
    });
    if (brokenDependencies.length > 0) {
      addLead();
      addDiagnostic('task_has_broken_dependencies');
    }

    for (const candidate of tasks) {
      if (candidate.id === task.id || isTerminalTask(candidate)) {
        continue;
      }
      if (
        (candidate.blockedBy ?? []).some(
          (dependencyId) => tasksByReference.get(dependencyId) === task
        )
      ) {
        addMember(candidate.owner);
        if (isDeletedTask(task)) {
          addLead();
          addDiagnostic('dependent_task_has_deleted_dependency');
        }
      }
    }

    return {
      memberNames: [...impacted].sort((left, right) => left.localeCompare(right)),
      fallbackTeamWide: false,
      diagnostics,
    };
  }
}
