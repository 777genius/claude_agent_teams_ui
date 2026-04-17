import { useStore } from '@renderer/store';
import {
  getCurrentProvisioningProgressForTeam,
  selectTeamDataForName,
} from '@renderer/store/slices/teamSlice';
import { useShallow } from 'zustand/react/shallow';

export function useGraphMemberPopoverContext(teamName: string, memberName: string) {
  return useStore(
    useShallow((state) => ({
      teamData: teamName ? selectTeamDataForName(state, teamName) : null,
      spawnEntry: teamName ? state.memberSpawnStatusesByTeam[teamName]?.[memberName] : undefined,
      leadActivity: teamName ? state.leadActivityByTeam[teamName] : undefined,
      progress: teamName ? getCurrentProvisioningProgressForTeam(state, teamName) : null,
      memberSpawnSnapshot: teamName ? state.memberSpawnSnapshotsByTeam[teamName] : undefined,
      memberSpawnStatuses: teamName ? state.memberSpawnStatusesByTeam[teamName] : undefined,
    }))
  );
}
