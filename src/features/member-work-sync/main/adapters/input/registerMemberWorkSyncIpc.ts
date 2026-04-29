import {
  MEMBER_WORK_SYNC_GET_STATUS,
  MEMBER_WORK_SYNC_REPORT,
  type MemberWorkSyncReportRequest,
  type MemberWorkSyncReportResult,
  type MemberWorkSyncStatus,
  type MemberWorkSyncStatusRequest,
} from '../../../contracts';
import { createLogger } from '@shared/utils/logger';

import type { MemberWorkSyncFeatureFacade } from '../../composition/createMemberWorkSyncFeature';
import type { IpcMain } from 'electron';

const logger = createLogger('Feature:MemberWorkSync:IPC');

export function registerMemberWorkSyncIpc(
  ipcMain: IpcMain,
  feature: MemberWorkSyncFeatureFacade
): void {
  ipcMain.handle(
    MEMBER_WORK_SYNC_GET_STATUS,
    async (_event, request: MemberWorkSyncStatusRequest): Promise<MemberWorkSyncStatus> => {
      try {
        return await feature.getStatus(request);
      } catch (error) {
        logger.error('Failed to get member work sync status', error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    MEMBER_WORK_SYNC_REPORT,
    async (_event, request: MemberWorkSyncReportRequest): Promise<MemberWorkSyncReportResult> => {
      try {
        return await feature.report(request);
      } catch (error) {
        logger.error('Failed to submit member work sync report', error);
        throw error;
      }
    }
  );
}

export function removeMemberWorkSyncIpc(ipcMain: IpcMain): void {
  ipcMain.removeHandler(MEMBER_WORK_SYNC_GET_STATUS);
  ipcMain.removeHandler(MEMBER_WORK_SYNC_REPORT);
}
