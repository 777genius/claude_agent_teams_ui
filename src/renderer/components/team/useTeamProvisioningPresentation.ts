import { useMemo } from 'react';

import { useStore } from '@renderer/store';
import {
  getCurrentProvisioningProgressForTeam,
  selectTeamMemberSnapshotsForName,
} from '@renderer/store/slices/teamSlice';
import { buildTeamProvisioningPresentation } from '@renderer/utils/teamProvisioningPresentation';
import { useShallow } from 'zustand/react/shallow';

import type { TeamProvisioningPresentation } from '@renderer/utils/teamProvisioningPresentation';
import type { RetryFailedOpenCodeSecondaryLanesResult } from '@shared/types';

export function useTeamProvisioningPresentation(teamName: string): {
  presentation: TeamProvisioningPresentation | null;
  cancelProvisioning: ((runId: string) => Promise<void>) | null;
  retryFailedOpenCodeSecondaryLanes:
    | ((teamName: string) => Promise<RetryFailedOpenCodeSecondaryLanesResult>)
    | null;
  runInstanceKey: string | null;
} {
  const {
    progress,
    cancelProvisioning,
    retryFailedOpenCodeSecondaryLanes,
    teamMembers,
    memberSpawnStatuses,
    memberSpawnSnapshot,
  } = useStore(
    useShallow((s) => ({
      progress: getCurrentProvisioningProgressForTeam(s, teamName),
      cancelProvisioning: s.cancelProvisioning,
      retryFailedOpenCodeSecondaryLanes: s.retryFailedOpenCodeSecondaryLanes,
      teamMembers: selectTeamMemberSnapshotsForName(s, teamName),
      memberSpawnStatuses: s.memberSpawnStatusesByTeam[teamName],
      memberSpawnSnapshot: s.memberSpawnSnapshotsByTeam[teamName],
    }))
  );

  const presentation = useMemo(
    () =>
      buildTeamProvisioningPresentation({
        progress,
        members: teamMembers,
        memberSpawnStatuses,
        memberSpawnSnapshot,
      }),
    [memberSpawnSnapshot, memberSpawnStatuses, progress, teamMembers]
  );

  return {
    presentation,
    cancelProvisioning,
    retryFailedOpenCodeSecondaryLanes: retryFailedOpenCodeSecondaryLanes ?? null,
    runInstanceKey: progress ? `${teamName}:${progress.runId}:${progress.startedAt}` : null,
  };
}
