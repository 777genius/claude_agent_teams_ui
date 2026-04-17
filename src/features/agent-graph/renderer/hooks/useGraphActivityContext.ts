import { useStore } from '@renderer/store';
import { selectTeamDataForName } from '@renderer/store/slices/teamSlice';
import { useShallow } from 'zustand/react/shallow';

import type { TeamData, TeamSummary } from '@shared/types/team';

export function useGraphActivityContext(teamName: string): {
  teamData: TeamData | null;
  teams: TeamSummary[];
} {
  return useStore(
    useShallow((state) => ({
      teamData: selectTeamDataForName(state, teamName),
      teams: state.teams,
    }))
  );
}
