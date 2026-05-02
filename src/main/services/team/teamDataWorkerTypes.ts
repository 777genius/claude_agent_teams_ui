/**
 * Shared request/response types for the team-data-worker thread.
 */

import type {
  MemberLogSummary,
  MessagesPage,
  TeamMemberActivityMeta,
  TeamViewSnapshot,
} from '@shared/types';

// ── Payloads ──

export interface GetTeamDataPayload {
  teamName: string;
}

export interface GetMessagesPagePayload {
  teamName: string;
  options: {
    cursor?: string | null;
    limit: number;
  };
}

export interface GetMemberActivityMetaPayload {
  teamName: string;
}

export interface FindLogsForTaskPayload {
  teamName: string;
  taskId: string;
  options?: {
    owner?: string;
    status?: string;
    intervals?: { startedAt: string; completedAt?: string }[];
    since?: string;
  };
}

export interface InvalidateTeamConfigPayload {
  teamName: string;
}

export interface InvalidateTeamMessageFeedPayload {
  teamName: string;
}

export interface TeamDataWorkerDiag {
  op: TeamDataWorkerRequest['op'];
  teamName?: string;
  taskId?: string;
  totalMs: number;
}

// ── Request / Response ──

export type TeamDataWorkerRequest =
  | { id: string; op: 'getTeamData'; payload: GetTeamDataPayload }
  | { id: string; op: 'getMessagesPage'; payload: GetMessagesPagePayload }
  | { id: string; op: 'getMemberActivityMeta'; payload: GetMemberActivityMetaPayload }
  | { id: string; op: 'findLogsForTask'; payload: FindLogsForTaskPayload }
  | { id: string; op: 'invalidateTeamConfig'; payload: InvalidateTeamConfigPayload }
  | { id: string; op: 'invalidateTeamMessageFeed'; payload: InvalidateTeamMessageFeedPayload };

export type TeamDataWorkerResponse =
  | {
      id: string;
      ok: true;
      result: TeamViewSnapshot | MessagesPage | TeamMemberActivityMeta | MemberLogSummary[] | null;
      diag?: TeamDataWorkerDiag;
    }
  | { id: string; ok: false; error: string };
