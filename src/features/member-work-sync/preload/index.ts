import {
  MEMBER_WORK_SYNC_GET_METRICS,
  MEMBER_WORK_SYNC_GET_STATUS,
  MEMBER_WORK_SYNC_REPORT,
  type MemberWorkSyncMetricsRequest,
  type MemberWorkSyncReportRequest,
  type MemberWorkSyncReportResult,
  type MemberWorkSyncStatus,
  type MemberWorkSyncStatusRequest,
  type MemberWorkSyncTeamMetrics,
} from '../contracts';

import type { IpcRenderer } from 'electron';

export interface MemberWorkSyncElectronApi {
  getStatus(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus>;
  getMetrics(request: MemberWorkSyncMetricsRequest): Promise<MemberWorkSyncTeamMetrics>;
  report(request: MemberWorkSyncReportRequest): Promise<MemberWorkSyncReportResult>;
}

export function createMemberWorkSyncBridge(ipcRenderer: IpcRenderer): MemberWorkSyncElectronApi {
  return {
    getStatus: (request) => ipcRenderer.invoke(MEMBER_WORK_SYNC_GET_STATUS, request),
    getMetrics: (request) => ipcRenderer.invoke(MEMBER_WORK_SYNC_GET_METRICS, request),
    report: (request) => ipcRenderer.invoke(MEMBER_WORK_SYNC_REPORT, request),
  };
}
