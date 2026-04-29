import type {
  MemberWorkSyncAgenda,
  MemberWorkSyncProviderId,
  MemberWorkSyncReport,
  MemberWorkSyncReportRequest,
  MemberWorkSyncStatus,
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
}

export interface MemberWorkSyncReportStorePort {
  appendPendingReport?(request: MemberWorkSyncReportRequest, reason: string): Promise<void>;
}

export interface MemberWorkSyncUseCaseDeps {
  clock: MemberWorkSyncClockPort;
  hash: MemberWorkSyncHashPort;
  agendaSource: MemberWorkSyncAgendaSourcePort;
  statusStore: MemberWorkSyncStatusStorePort;
  reportStore?: MemberWorkSyncReportStorePort;
  reportToken?: MemberWorkSyncReportTokenPort;
  lifecycle?: MemberWorkSyncLifecyclePort;
  logger?: MemberWorkSyncLoggerPort;
}

export interface LatestAcceptedReportLookup {
  latestAcceptedReport?: MemberWorkSyncReport;
}
