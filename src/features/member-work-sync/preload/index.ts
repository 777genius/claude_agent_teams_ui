import {
  MEMBER_WORK_SYNC_GET_STATUS,
  MEMBER_WORK_SYNC_REPORT,
  type MemberWorkSyncReportRequest,
  type MemberWorkSyncReportResult,
  type MemberWorkSyncStatus,
  type MemberWorkSyncStatusRequest,
} from '../contracts';

import type { IpcRenderer } from 'electron';

export interface MemberWorkSyncElectronApi {
  getStatus(request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus>;
  report(request: MemberWorkSyncReportRequest): Promise<MemberWorkSyncReportResult>;
}

export function createMemberWorkSyncBridge(ipcRenderer: IpcRenderer): MemberWorkSyncElectronApi {
  return {
    getStatus: (request) => ipcRenderer.invoke(MEMBER_WORK_SYNC_GET_STATUS, request),
    report: (request) => ipcRenderer.invoke(MEMBER_WORK_SYNC_REPORT, request),
  };
}
