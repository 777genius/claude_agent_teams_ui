import {
  buildAgendaFingerprintPayload,
  canonicalizeAgendaFingerprintPayload,
  formatAgendaFingerprint,
} from './AgendaFingerprint';
import { resolveCurrentReviewOwner, type ReviewHistoryEventLike } from './currentReviewCycle';
import { isReservedMemberName, normalizeMemberName, sameMemberName } from './memberName';

import type {
  MemberWorkSyncActionableWorkItem,
  MemberWorkSyncAgenda,
  MemberWorkSyncProviderId,
} from '../../contracts';

export interface MemberWorkSyncTaskLike {
  id: string;
  displayId?: string;
  subject?: string;
  status: string;
  owner?: string | null;
  reviewState?: string | null;
  needsClarification?: 'lead' | 'user' | null;
  blockedBy?: string[];
  blocks?: string[];
  deletedAt?: string | null;
  historyEvents?: ReviewHistoryEventLike[];
}

export interface MemberWorkSyncMemberLike {
  name: string;
  providerId?: MemberWorkSyncProviderId | string;
  model?: string;
  agentType?: string;
  removedAt?: string | null;
}

export interface BuildActionableWorkAgendaInput {
  teamName: string;
  memberName: string;
  generatedAt: string;
  tasks: MemberWorkSyncTaskLike[];
  members: MemberWorkSyncMemberLike[];
  kanbanReviewersByTaskId?: Record<string, string | null | undefined>;
  sourceRevision?: string;
  hash: (canonicalPayload: string) => string;
}

function isCompletedOrDeleted(task: MemberWorkSyncTaskLike): boolean {
  return task.status === 'completed' || task.status === 'deleted' || Boolean(task.deletedAt);
}

function getActiveMemberNames(members: MemberWorkSyncMemberLike[]): Set<string> {
  return new Set(
    members
      .filter((member) => !member.removedAt)
      .map((member) => normalizeMemberName(member.name))
      .filter((name) => name.length > 0 && !isReservedMemberName(name))
  );
}

function isLeadLike(member: MemberWorkSyncMemberLike): boolean {
  const name = normalizeMemberName(member.name);
  const agentType = typeof member.agentType === 'string' ? member.agentType : '';
  return (
    name === 'team-lead' ||
    agentType === 'team-lead' ||
    agentType === 'lead' ||
    agentType === 'orchestrator'
  );
}

function getActiveLeadName(members: MemberWorkSyncMemberLike[]): string | null {
  const lead = members.find((member) => !member.removedAt && isLeadLike(member));
  return lead ? normalizeMemberName(lead.name) : null;
}

function buildBaseItem(
  task: MemberWorkSyncTaskLike,
  memberName: string
): Omit<MemberWorkSyncActionableWorkItem, 'kind' | 'priority' | 'reason' | 'evidence'> {
  return {
    taskId: task.id,
    ...(task.displayId ? { displayId: task.displayId } : {}),
    subject: task.subject?.trim() || 'Untitled task',
    assignee: memberName,
  };
}

function taskReferenceKeys(task: Pick<MemberWorkSyncTaskLike, 'id' | 'displayId'>): string[] {
  const keys = [task.id, task.displayId]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(keys.flatMap((value) => [value, value.replace(/^#/, '')]))];
}

export function buildActionableWorkAgenda(
  input: BuildActionableWorkAgendaInput
): MemberWorkSyncAgenda {
  const memberName = normalizeMemberName(input.memberName);
  const diagnostics: string[] = [];
  const activeMemberNames = getActiveMemberNames(input.members);
  const activeLeadName = getActiveLeadName(input.members);
  const tasksByReference = new Map(
    input.tasks.flatMap((task) => taskReferenceKeys(task).map((key) => [key, task] as const))
  );

  if (!memberName || isReservedMemberName(memberName)) {
    diagnostics.push('member_invalid_or_reserved');
  } else if (!activeMemberNames.has(memberName)) {
    diagnostics.push('member_not_active');
  }

  const items: MemberWorkSyncActionableWorkItem[] = [];

  if (activeMemberNames.has(memberName)) {
    for (const task of input.tasks) {
      if (!task.id || isCompletedOrDeleted(task)) {
        continue;
      }

      const owner = normalizeMemberName(task.owner);
      const base = buildBaseItem(task, memberName);
      const blockedBy = [...(task.blockedBy ?? [])].filter(Boolean).sort();
      const blocks = [...(task.blocks ?? [])].filter(Boolean).sort();
      const brokenDependencyIds: string[] = [];
      const waitingDependencyIds: string[] = [];
      for (const dependencyId of blockedBy) {
        const dependency = tasksByReference.get(dependencyId) ?? null;
        if (!dependency || dependency.status === 'deleted' || dependency.deletedAt) {
          brokenDependencyIds.push(dependencyId);
        } else if (dependency.status !== 'completed') {
          waitingDependencyIds.push(dependencyId);
        }
      }

      if (
        activeLeadName &&
        sameMemberName(activeLeadName, memberName) &&
        task.needsClarification === 'lead'
      ) {
        items.push({
          ...base,
          kind: 'clarification',
          priority: 'needs_clarification',
          reason: 'task_needs_lead_clarification',
          evidence: {
            status: task.status,
            ...(owner ? { owner } : {}),
            ...(task.reviewState ? { reviewState: task.reviewState } : {}),
            needsClarification: 'lead',
          },
        });
        continue;
      }

      if (
        activeLeadName &&
        sameMemberName(activeLeadName, memberName) &&
        brokenDependencyIds.length > 0
      ) {
        items.push({
          ...base,
          kind: 'blocked_dependency',
          priority: 'blocked',
          reason: 'task_has_broken_dependency',
          evidence: {
            status: task.status,
            ...(owner ? { owner } : {}),
            ...(task.reviewState ? { reviewState: task.reviewState } : {}),
            blockedByTaskIds: brokenDependencyIds,
            ...(blocks.length > 0 ? { blockerTaskIds: blocks } : {}),
          },
        });
        continue;
      }

      const reviewOwner = resolveCurrentReviewOwner({
        reviewState: task.reviewState,
        kanbanReviewer: input.kanbanReviewersByTaskId?.[task.id] ?? null,
        historyEvents: task.historyEvents,
      });

      if (reviewOwner && sameMemberName(reviewOwner.reviewer, memberName)) {
        items.push({
          ...base,
          kind: 'review',
          priority: 'review_requested',
          reason: 'current_cycle_review_assigned',
          evidence: {
            status: task.status,
            ...(owner ? { owner } : {}),
            reviewer: memberName,
            ...(task.reviewState ? { reviewState: task.reviewState } : {}),
            ...(reviewOwner.historyEventIds.length > 0
              ? { historyEventIds: reviewOwner.historyEventIds }
              : {}),
          },
        });
        continue;
      }

      if (!sameMemberName(owner, memberName)) {
        continue;
      }

      if (task.needsClarification === 'lead' || task.needsClarification === 'user') {
        continue;
      }

      if (waitingDependencyIds.length > 0 || brokenDependencyIds.length > 0) {
        continue;
      }

      if (
        task.status === 'pending' ||
        task.status === 'in_progress' ||
        task.reviewState === 'needsFix'
      ) {
        items.push({
          ...base,
          kind: 'work',
          priority: 'normal',
          reason:
            task.reviewState === 'needsFix'
              ? 'review_changes_requested'
              : task.status === 'pending'
                ? 'owned_pending_task'
                : 'owned_in_progress_task',
          evidence: {
            status: task.status,
            owner: memberName,
            ...(task.reviewState ? { reviewState: task.reviewState } : {}),
          },
        });
      }
    }
  }

  const payload = buildAgendaFingerprintPayload({
    teamName: input.teamName,
    memberName,
    items,
    sourceRevision: input.sourceRevision,
  });
  const canonicalPayload = canonicalizeAgendaFingerprintPayload(payload);

  return {
    teamName: input.teamName,
    memberName,
    generatedAt: input.generatedAt,
    fingerprint: formatAgendaFingerprint(input.hash(canonicalPayload)),
    items,
    diagnostics,
    ...(input.sourceRevision ? { sourceRevision: input.sourceRevision } : {}),
  };
}
