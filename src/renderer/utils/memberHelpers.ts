import i18next from 'i18next';

import {
  getMemberColorByName,
  MEMBER_COLOR_PALETTE,
  normalizeMemberColorName,
} from '@shared/constants/memberColors';
import { isLeadMember } from '@shared/utils/leadDetection';

import type {
  LeadActivityState,
  MemberSpawnStatus,
  MemberStatus,
  ResolvedTeamMember,
  TeamReviewState,
  TeamTaskStatus,
} from '@shared/types';

/**
 * UI display name for a team member.
 * "team-lead" → "lead"; everything else passes through unchanged.
 * Data layer (store, IPC, backend) must keep the original name untouched.
 */
export function displayMemberName(name: string): string {
  return name === 'team-lead' ? 'lead' : name;
}

export function agentAvatarUrl(name: string, size = 64): string {
  return `https://robohash.org/${encodeURIComponent(name)}?size=${size}x${size}`;
}

export const STATUS_DOT_COLORS: Record<MemberStatus, string> = {
  active: 'bg-emerald-400',
  idle: 'bg-zinc-400',
  terminated: 'bg-red-400',
  unknown: 'bg-zinc-600',
};

export function getMemberDotClass(
  member: ResolvedTeamMember,
  isTeamAlive?: boolean,
  isTeamProvisioning?: boolean,
  leadActivity?: LeadActivityState
): string {
  if (member.status === 'terminated') return STATUS_DOT_COLORS.terminated;
  if (member.removedAt) return STATUS_DOT_COLORS.terminated;
  // Lead activity check BEFORE provisioning fallback — when the lead process
  // is running (CLI logs present), show green even during provisioning.
  if (leadActivity && isLeadMember(member)) {
    return leadActivity === 'active'
      ? `${STATUS_DOT_COLORS.active} animate-pulse`
      : STATUS_DOT_COLORS.active;
  }
  if (isTeamProvisioning) return STATUS_DOT_COLORS.unknown;
  if (isTeamAlive === false) return STATUS_DOT_COLORS.terminated;
  // When team is alive, all non-terminated members are online
  if (isTeamAlive) {
    if (member.currentTaskId) return `${STATUS_DOT_COLORS.active} animate-pulse`;
    return STATUS_DOT_COLORS.active;
  }
  if (member.status === 'unknown') return STATUS_DOT_COLORS.unknown;
  if (member.currentTaskId) return STATUS_DOT_COLORS.active;
  return member.status === 'active' ? STATUS_DOT_COLORS.active : STATUS_DOT_COLORS.idle;
}

export function getPresenceLabel(
  member: ResolvedTeamMember,
  isTeamAlive?: boolean,
  isTeamProvisioning?: boolean,
  leadActivity?: LeadActivityState,
  leadContextPercent?: number
): string {
  if (member.status === 'terminated')
    return i18next.t('utils.memberHelpers.presenceLabels.terminated');
  // Lead activity check before provisioning fallback (mirrors getMemberDotClass order).
  if (leadActivity && isLeadMember(member)) {
    if (leadActivity === 'active') {
      return leadContextPercent != null && leadContextPercent > 0
        ? i18next.t('utils.memberHelpers.presenceLabels.processing_with_pct', {
            pct: Math.round(leadContextPercent),
          })
        : i18next.t('utils.memberHelpers.presenceLabels.processing');
    }
    return i18next.t('utils.memberHelpers.presenceLabels.ready');
  }
  if (isTeamProvisioning) return i18next.t('utils.memberHelpers.presenceLabels.connecting');
  if (isTeamAlive === false) return i18next.t('utils.memberHelpers.presenceLabels.offline');
  if (member.status === 'unknown') return i18next.t('utils.memberHelpers.presenceLabels.idle');
  return member.currentTaskId
    ? i18next.t('utils.memberHelpers.presenceLabels.working')
    : i18next.t('utils.memberHelpers.presenceLabels.idle');
}

/* ------------------------------------------------------------------ */
/*  Spawn-status-aware helpers for progressive member card appearance  */
/* ------------------------------------------------------------------ */

export const SPAWN_DOT_COLORS: Record<MemberSpawnStatus, string> = {
  offline: 'bg-zinc-600',
  waiting: 'bg-zinc-400 animate-pulse',
  spawning: 'bg-amber-400',
  online: 'bg-emerald-400 animate-[dot-online-jelly_0.45s_ease-out]',
  error: 'bg-red-400',
};

export const SPAWN_PRESENCE_LABELS: Record<MemberSpawnStatus, string> = {
  get offline() {
    return i18next.t('utils.memberHelpers.spawnPresenceLabels.offline');
  },
  get waiting() {
    return i18next.t('utils.memberHelpers.spawnPresenceLabels.waiting');
  },
  get spawning() {
    return i18next.t('utils.memberHelpers.spawnPresenceLabels.spawning');
  },
  get online() {
    return i18next.t('utils.memberHelpers.spawnPresenceLabels.online');
  },
  get error() {
    return i18next.t('utils.memberHelpers.spawnPresenceLabels.spawn_failed');
  },
};

/**
 * Returns dot class for a member during provisioning, respecting spawn status.
 * Falls back to the existing `getMemberDotClass` when no spawn status is available.
 */
export function getSpawnAwareDotClass(
  member: ResolvedTeamMember,
  spawnStatus: MemberSpawnStatus | undefined,
  isTeamAlive?: boolean,
  isTeamProvisioning?: boolean,
  leadActivity?: LeadActivityState
): string {
  if (spawnStatus && isTeamProvisioning) {
    return SPAWN_DOT_COLORS[spawnStatus];
  }
  return getMemberDotClass(member, isTeamAlive, isTeamProvisioning, leadActivity);
}

/**
 * Returns presence label for a member during provisioning, respecting spawn status.
 */
export function getSpawnAwarePresenceLabel(
  member: ResolvedTeamMember,
  spawnStatus: MemberSpawnStatus | undefined,
  isTeamAlive?: boolean,
  isTeamProvisioning?: boolean,
  leadActivity?: LeadActivityState
): string {
  if (spawnStatus && isTeamProvisioning) {
    return SPAWN_PRESENCE_LABELS[spawnStatus];
  }
  return getPresenceLabel(member, isTeamAlive, isTeamProvisioning, leadActivity);
}

/**
 * Card container CSS classes based on spawn status (opacity + animation).
 * Used by MemberCard wrapper for fade-in transitions.
 */
export function getSpawnCardClass(spawnStatus: MemberSpawnStatus | undefined): string {
  switch (spawnStatus) {
    case 'offline':
      return 'opacity-40';
    case 'waiting':
      return 'member-waiting-shimmer';
    case 'spawning':
      return '';
    case 'online':
      return 'animate-[member-fade-in_0.4s_ease-out]';
    case 'error':
      return 'opacity-80';
    default:
      return '';
  }
}

export const TASK_STATUS_STYLES: Record<TeamTaskStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
  in_progress: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  completed: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  deleted: { bg: 'bg-red-500/15', text: 'text-red-400' },
};

export const TASK_STATUS_LABELS: Record<TeamTaskStatus, string> = {
  get pending() {
    return i18next.t('utils.memberHelpers.taskStatusLabels.pending');
  },
  get in_progress() {
    return i18next.t('utils.memberHelpers.taskStatusLabels.in_progress');
  },
  get completed() {
    return i18next.t('utils.memberHelpers.taskStatusLabels.completed');
  },
  get deleted() {
    return i18next.t('utils.memberHelpers.taskStatusLabels.deleted');
  },
};

interface MemberColorInput {
  name: string;
  color?: string;
  removedAt?: number | string | null;
  agentType?: string;
  role?: string;
}

/**
 * Build a consistent name→colorName map for all members.
 * Active members receive colors sequentially from MEMBER_COLOR_PALETTE,
 * which is pre-ordered for maximum visual contrast between consecutive entries.
 * If a member has a stored color that hasn't been assigned yet, it is used instead.
 * Maps "user" to a reserved color.
 */
export function buildMemberColorMap(members: MemberColorInput[]): Map<string, string> {
  const map = new Map<string, string>();
  const active = members.filter((m) => !m.removedAt);
  const removed = members.filter((m) => m.removedAt);
  const usedColors = new Set<string>();
  let nextPaletteIdx = 0;

  for (const member of active) {
    let color = member.color ? normalizeMemberColorName(member.color) : undefined;
    if (!color || usedColors.has(color)) {
      // Assign the next unused color from the pre-ordered palette.
      while (
        nextPaletteIdx < MEMBER_COLOR_PALETTE.length &&
        usedColors.has(MEMBER_COLOR_PALETTE[nextPaletteIdx])
      ) {
        nextPaletteIdx++;
      }
      color =
        nextPaletteIdx < MEMBER_COLOR_PALETTE.length
          ? MEMBER_COLOR_PALETTE[nextPaletteIdx]
          : MEMBER_COLOR_PALETTE[active.indexOf(member) % MEMBER_COLOR_PALETTE.length];
      nextPaletteIdx++;
    }
    map.set(member.name, color);
    usedColors.add(color);
  }

  for (const member of removed) {
    const color = member.color
      ? normalizeMemberColorName(member.color)
      : getMemberColorByName(member.name);
    map.set(member.name, color);
  }

  map.set('user', 'user');

  return map;
}

export const KANBAN_COLUMN_DISPLAY: Record<
  'review' | 'approved',
  { label: string; bg: string; text: string }
> = {
  review: {
    get label() {
      return i18next.t('utils.memberHelpers.kanbanColumnDisplay.in_review');
    },
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
  },
  approved: {
    get label() {
      return i18next.t('utils.memberHelpers.kanbanColumnDisplay.approved');
    },
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
  },
};

export const REVIEW_STATE_DISPLAY: Record<
  Exclude<TeamReviewState, 'none'>,
  { label: string; bg: string; text: string }
> = {
  review: {
    get label() {
      return i18next.t('utils.memberHelpers.kanbanColumnDisplay.in_review');
    },
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
  },
  needsFix: {
    get label() {
      return i18next.t('utils.memberHelpers.kanbanColumnDisplay.needs_fixes');
    },
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
  },
  approved: {
    get label() {
      return i18next.t('utils.memberHelpers.kanbanColumnDisplay.approved');
    },
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
  },
};
