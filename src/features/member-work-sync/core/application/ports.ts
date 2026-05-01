import type {
  MemberWorkSyncAgenda,
  MemberWorkSyncOutboxClaimInput,
  MemberWorkSyncOutboxCountRecentDeliveredInput,
  MemberWorkSyncOutboxEnsureInput,
  MemberWorkSyncOutboxEnsureResult,
  MemberWorkSyncOutboxItem,
  MemberWorkSyncOutboxMarkDeliveredInput,
  MemberWorkSyncOutboxMarkFailedInput,
  MemberWorkSyncOutboxMarkSupersededInput,
  MemberWorkSyncProviderId,
  MemberWorkSyncReport,
  MemberWorkSyncReportIntent,
  MemberWorkSyncReportIntentStatus,
  MemberWorkSyncReportRequest,
  MemberWorkSyncStatus,
  MemberWorkSyncTeamMetrics,
} from '../../contracts';

export interface MemberWorkSyncClockPort {
  now(): Date;
}

export interface MemberWorkSyncHashPort {
  sha256Hex(value: string): string;
}

export interface MemberWorkSyncReportTokenCreateInput {
  teamName: string;
  memberName: string;
  agendaFingerprint: string;
  issuedAt: string;
}

export interface MemberWorkSyncReportTokenVerifyInput {
  token?: string;
  teamName: string;
  memberName: string;
  agendaFingerprint: string;
  nowIso: string;
}

export type MemberWorkSyncReportTokenVerification =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' };

export interface MemberWorkSyncReportTokenPort {
  create(input: MemberWorkSyncReportTokenCreateInput): Promise<{
    token: string;
    expiresAt: string;
  }>;
  verify(
    input: MemberWorkSyncReportTokenVerifyInput
  ): Promise<MemberWorkSyncReportTokenVerification>;
}

export interface MemberWorkSyncLifecyclePort {
  isTeamActive(teamName: string): Promise<boolean> | boolean;
}

export interface MemberWorkSyncLoggerPort {
  debug(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export type MemberWorkSyncAuditEventName =
  | 'turn_settled_claimed'
  | 'turn_settled_resolved'
  | 'turn_settled_unresolved'
  | 'turn_settled_ignored'
  | 'queue_enqueued'
  | 'queue_coalesced'
  | 'queue_reconciled'
  | 'queue_dropped'
  | 'reconcile_started'
  | 'agenda_loaded'
  | 'decision_made'
  | 'status_written'
  | 'report_received'
  | 'report_accepted'
  | 'report_rejected'
  | 'nudge_planned'
  | 'nudge_delivered'
  | 'nudge_skipped'
  | 'nudge_retryable'
  | 'nudge_superseded'
  | 'watchdog_cooldown_active'
  | 'member_busy'
  | 'team_inactive'
  | 'index_repaired'
  | 'legacy_fallback_used';

export interface MemberWorkSyncAuditEvent {
  timestamp: string;
  teamName: string;
  memberName: string;
  event: MemberWorkSyncAuditEventName;
  source: string;
  agendaFingerprint?: string;
  state?: string;
  actionableCount?: number;
  reason?: string;
  triggerReasons?: string[];
  providerId?: string;
  taskRefs?: { taskId: string; displayId?: string; teamName?: string }[];
  diagnostics?: string[];
  messagePreview?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MemberWorkSyncAuditJournalPort {
  append(event: MemberWorkSyncAuditEvent): Promise<void>;
}

export interface MemberWorkSyncAgendaSourceResult {
  agenda: Omit<MemberWorkSyncAgenda, 'fingerprint'>;
  activeMemberNames: string[];
  inactive: boolean;
  providerId?: MemberWorkSyncProviderId;
  diagnostics: string[];
}

export interface MemberWorkSyncAgendaSourcePort {
  loadAgenda(input: {
    teamName: string;
    memberName: string;
  }): Promise<MemberWorkSyncAgendaSourceResult>;
}

export interface MemberWorkSyncStatusStorePort {
  read(input: { teamName: string; memberName: string }): Promise<MemberWorkSyncStatus | null>;
  write(status: MemberWorkSyncStatus): Promise<void>;
  readTeamMetrics?(teamName: string): Promise<MemberWorkSyncTeamMetrics>;
}

export interface MemberWorkSyncReportStorePort {
  appendPendingReport?(request: MemberWorkSyncReportRequest, reason: string): Promise<void>;
  listPendingReports?(teamName: string): Promise<MemberWorkSyncReportIntent[]>;
  markPendingReportProcessed?(
    teamName: string,
    id: string,
    result: { status: MemberWorkSyncReportIntentStatus; resultCode: string; processedAt: string }
  ): Promise<void>;
}

export interface MemberWorkSyncOutboxStorePort {
  ensurePending(input: MemberWorkSyncOutboxEnsureInput): Promise<MemberWorkSyncOutboxEnsureResult>;
  claimDue(input: MemberWorkSyncOutboxClaimInput): Promise<MemberWorkSyncOutboxItem[]>;
  markDelivered(input: MemberWorkSyncOutboxMarkDeliveredInput): Promise<void>;
  markSuperseded(input: MemberWorkSyncOutboxMarkSupersededInput): Promise<void>;
  markFailed(input: MemberWorkSyncOutboxMarkFailedInput): Promise<void>;
  countRecentDelivered(input: MemberWorkSyncOutboxCountRecentDeliveredInput): Promise<number>;
}

export interface MemberWorkSyncInboxNudgePort {
  insertIfAbsent(input: {
    teamName: string;
    memberName: string;
    messageId: string;
    payloadHash: string;
    payload: MemberWorkSyncOutboxItem['payload'];
    timestamp: string;
  }): Promise<{ inserted: boolean; messageId: string; conflict?: boolean }>;
}

export interface MemberWorkSyncWatchdogCooldownPort {
  hasRecentNudge(input: {
    teamName: string;
    memberName: string;
    taskIds: string[];
    nowIso: string;
  }): Promise<boolean>;
}

export interface MemberWorkSyncBusySignalPort {
  isBusy(input: {
    teamName: string;
    memberName: string;
    nowIso: string;
  }): Promise<{ busy: boolean; reason?: string; retryAfterIso?: string }>;
}

export interface MemberWorkSyncUseCaseDeps {
  clock: MemberWorkSyncClockPort;
  hash: MemberWorkSyncHashPort;
  agendaSource: MemberWorkSyncAgendaSourcePort;
  statusStore: MemberWorkSyncStatusStorePort;
  reportStore?: MemberWorkSyncReportStorePort;
  outboxStore?: MemberWorkSyncOutboxStorePort;
  inboxNudge?: MemberWorkSyncInboxNudgePort;
  watchdogCooldown?: MemberWorkSyncWatchdogCooldownPort;
  busySignal?: MemberWorkSyncBusySignalPort;
  reportToken?: MemberWorkSyncReportTokenPort;
  auditJournal?: MemberWorkSyncAuditJournalPort;
  lifecycle?: MemberWorkSyncLifecyclePort;
  logger?: MemberWorkSyncLoggerPort;
}

export interface LatestAcceptedReportLookup {
  latestAcceptedReport?: MemberWorkSyncReport;
}
