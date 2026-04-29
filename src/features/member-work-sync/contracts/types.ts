export type MemberWorkSyncReportState = 'still_working' | 'blocked' | 'caught_up';

export type MemberWorkSyncStatusState =
  | 'caught_up'
  | 'needs_sync'
  | 'still_working'
  | 'blocked'
  | 'inactive'
  | 'unknown';

export type MemberWorkSyncActionableWorkKind =
  | 'work'
  | 'review'
  | 'clarification'
  | 'blocked_dependency';

export type MemberWorkSyncActionableWorkPriority =
  | 'normal'
  | 'review_requested'
  | 'blocked'
  | 'needs_clarification';

export type MemberWorkSyncProviderId = 'anthropic' | 'codex' | 'gemini' | 'opencode';

export interface MemberWorkSyncActionableWorkItem {
  taskId: string;
  displayId?: string;
  subject: string;
  kind: MemberWorkSyncActionableWorkKind;
  assignee: string;
  priority: MemberWorkSyncActionableWorkPriority;
  reason: string;
  evidence: {
    status: string;
    owner?: string;
    reviewer?: string;
    reviewState?: string;
    needsClarification?: 'lead' | 'user';
    blockerTaskIds?: string[];
    blockedByTaskIds?: string[];
    historyEventIds?: string[];
  };
}

export interface MemberWorkSyncAgenda {
  teamName: string;
  memberName: string;
  generatedAt: string;
  fingerprint: string;
  items: MemberWorkSyncActionableWorkItem[];
  diagnostics: string[];
  sourceRevision?: string;
}

export interface MemberWorkSyncReport {
  state: MemberWorkSyncReportState;
  agendaFingerprint: string;
  memberName: string;
  teamName: string;
  reportedAt: string;
  expiresAt?: string;
  taskIds?: string[];
  note?: string;
  source?: 'mcp' | 'app' | 'test';
  accepted: boolean;
  rejectionCode?: string;
}

export type MemberWorkSyncReportIntentStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';

export interface MemberWorkSyncReportIntent {
  id: string;
  teamName: string;
  memberName: string;
  request: MemberWorkSyncReportRequest;
  reason: string;
  status: MemberWorkSyncReportIntentStatus;
  recordedAt: string;
  processedAt?: string;
  resultCode?: string;
}

export interface MemberWorkSyncShadowDiagnostics {
  reconciledBy: 'request' | 'queue' | 'report';
  wouldNudge: boolean;
  fingerprintChanged: boolean;
  previousFingerprint?: string;
  triggerReasons?: string[];
}

export interface MemberWorkSyncStatus {
  teamName: string;
  memberName: string;
  state: MemberWorkSyncStatusState;
  agenda: MemberWorkSyncAgenda;
  report?: MemberWorkSyncReport;
  reportToken?: string;
  reportTokenExpiresAt?: string;
  shadow?: MemberWorkSyncShadowDiagnostics;
  evaluatedAt: string;
  diagnostics: string[];
  providerId?: MemberWorkSyncProviderId;
}

export type MemberWorkSyncMetricEventKind =
  | 'status_evaluated'
  | 'would_nudge'
  | 'fingerprint_changed'
  | 'report_accepted'
  | 'report_rejected';

export interface MemberWorkSyncMetricEvent {
  id: string;
  teamName: string;
  memberName: string;
  kind: MemberWorkSyncMetricEventKind;
  state: MemberWorkSyncStatusState;
  agendaFingerprint: string;
  recordedAt: string;
  actionableCount: number;
  providerId?: MemberWorkSyncProviderId;
  previousFingerprint?: string;
  triggerReasons?: string[];
  reportState?: MemberWorkSyncReportState;
  rejectionCode?: string;
}

export interface MemberWorkSyncTeamMetrics {
  teamName: string;
  generatedAt: string;
  memberCount: number;
  stateCounts: Record<MemberWorkSyncStatusState, number>;
  actionableItemCount: number;
  wouldNudgeCount: number;
  fingerprintChangeCount: number;
  reportAcceptedCount: number;
  reportRejectedCount: number;
  recentEvents: MemberWorkSyncMetricEvent[];
}

export interface MemberWorkSyncReportRequest {
  teamName: string;
  memberName: string;
  state: MemberWorkSyncReportState;
  agendaFingerprint: string;
  reportToken?: string;
  taskIds?: string[];
  note?: string;
  reportedAt?: string;
  leaseTtlMs?: number;
  source?: 'mcp' | 'app' | 'test';
}

export interface MemberWorkSyncReportResult {
  accepted: boolean;
  code: string;
  message: string;
  status: MemberWorkSyncStatus;
}

export interface MemberWorkSyncStatusRequest {
  teamName: string;
  memberName: string;
}

export interface MemberWorkSyncMetricsRequest {
  teamName: string;
}
