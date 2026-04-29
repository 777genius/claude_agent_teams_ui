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
  logger?: MemberWorkSyncLoggerPort;
}

export interface LatestAcceptedReportLookup {
  latestAcceptedReport?: MemberWorkSyncReport;
}
