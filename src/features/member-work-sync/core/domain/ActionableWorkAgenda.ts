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

export function buildActionableWorkAgenda(
  input: BuildActionableWorkAgendaInput
): MemberWorkSyncAgenda {
  const memberName = normalizeMemberName(input.memberName);
  const diagnostics: string[] = [];
  const activeMemberNames = getActiveMemberNames(input.members);

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
        items.push({
          ...base,
          kind: 'clarification',
          priority: 'needs_clarification',
          reason: `task_needs_${task.needsClarification}_clarification`,
          evidence: {
            status: task.status,
            owner: memberName,
            ...(task.reviewState ? { reviewState: task.reviewState } : {}),
            needsClarification: task.needsClarification,
          },
        });
        continue;
      }

      if (blockedBy.length > 0) {
        items.push({
          ...base,
          kind: 'blocked_dependency',
          priority: 'blocked',
          reason: 'owned_task_has_blocked_dependency',
          evidence: {
            status: task.status,
            owner: memberName,
            ...(task.reviewState ? { reviewState: task.reviewState } : {}),
            blockedByTaskIds: blockedBy,
            ...(blocks.length > 0 ? { blockerTaskIds: blocks } : {}),
          },
        });
        continue;
      }

      if (task.status === 'pending' || task.status === 'in_progress') {
        items.push({
          ...base,
          kind: 'work',
          priority: 'normal',
          reason: task.status === 'pending' ? 'owned_pending_task' : 'owned_in_progress_task',
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
