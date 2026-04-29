export {
  registerMemberWorkSyncIpc,
  removeMemberWorkSyncIpc,
} from './adapters/input/registerMemberWorkSyncIpc';
export {
  MEMBER_WORK_SYNC_NUDGE_SIDE_EFFECTS_ENV,
  createMemberWorkSyncFeature,
  resolveMemberWorkSyncNudgeSideEffectsEnabled,
} from './composition/createMemberWorkSyncFeature';
export type { MemberWorkSyncFeatureFacade } from './composition/createMemberWorkSyncFeature';
