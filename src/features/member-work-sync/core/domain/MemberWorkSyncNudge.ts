import type {
  MemberWorkSyncNudgePayload,
  MemberWorkSyncOutboxEnsureInput,
  MemberWorkSyncStatus,
} from '../../contracts';

export const MEMBER_WORK_SYNC_NUDGE_ID_PREFIX = 'member-work-sync';

interface MemberWorkSyncNudgeHash {
  sha256Hex(value: string): string;
}

function stableJson(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function buildMemberWorkSyncNudgeId(input: {
  teamName: string;
  memberName: string;
  agendaFingerprint: string;
}): string {
  return [
    MEMBER_WORK_SYNC_NUDGE_ID_PREFIX,
    input.teamName,
    input.memberName.trim().toLowerCase(),
    input.agendaFingerprint,
  ].join(':');
}

export function buildMemberWorkSyncNudgePayload(status: MemberWorkSyncStatus): MemberWorkSyncNudgePayload {
  const taskRefs = status.agenda.items.map((item) => ({
    teamName: status.teamName,
    taskId: item.taskId,
    displayId: item.displayId ?? item.taskId.slice(0, 8),
  }));
  const preview = status.agenda.items
    .slice(0, 3)
    .map((item) => `${item.displayId ?? item.taskId.slice(0, 8)} ${item.subject}`)
    .join('; ');

  return {
    from: 'system',
    to: status.memberName,
    messageKind: 'member_work_sync_nudge',
    source: 'member-work-sync',
    actionMode: 'do',
    taskRefs,
    text: [
      'Work sync check: you have current actionable work assigned.',
      preview ? `Current agenda: ${preview}.` : '',
      'Continue concrete task work, report a real blocker with task tools, or call member_work_sync_report for the current fingerprint.',
      'Do not reply only with acknowledgement.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function buildMemberWorkSyncNudgePayloadHash(
  hash: MemberWorkSyncNudgeHash,
  payload: MemberWorkSyncNudgePayload
): string {
  return hash.sha256Hex(stableJson(payload));
}

export function buildMemberWorkSyncOutboxEnsureInput(input: {
  status: MemberWorkSyncStatus;
  hash: MemberWorkSyncNudgeHash;
  nowIso: string;
}): MemberWorkSyncOutboxEnsureInput | null {
  const status = input.status;
  if (
    status.state !== 'needs_sync' ||
    status.shadow?.wouldNudge !== true ||
    status.agenda.items.length === 0
  ) {
    return null;
  }

  const payload = buildMemberWorkSyncNudgePayload(status);
  return {
    id: buildMemberWorkSyncNudgeId({
      teamName: status.teamName,
      memberName: status.memberName,
      agendaFingerprint: status.agenda.fingerprint,
    }),
    teamName: status.teamName,
    memberName: status.memberName,
    agendaFingerprint: status.agenda.fingerprint,
    payloadHash: buildMemberWorkSyncNudgePayloadHash(input.hash, payload),
    payload,
    nowIso: input.nowIso,
  };
}
