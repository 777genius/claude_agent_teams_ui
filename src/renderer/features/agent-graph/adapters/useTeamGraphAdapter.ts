/**
 * React hook bridge for TeamGraphAdapter class.
 * Thin wrapper — instantiates the class adapter and calls adapt() with store data.
 */

import { useMemo, useRef } from 'react';

import { useStore } from '@renderer/store';
import { useShallow } from 'zustand/react/shallow';

import { TeamGraphAdapter } from './TeamGraphAdapter';

import type { GraphDataPort } from '@claude-teams/agent-graph';

export function useTeamGraphAdapter(teamName: string): GraphDataPort {
  const adapterRef = useRef<TeamGraphAdapter>(TeamGraphAdapter.create());

  const { teamData, spawnStatuses, leadContext } = useStore(
    useShallow((s) => ({
      teamData: s.selectedTeamData,
      spawnStatuses: teamName ? s.memberSpawnStatusesByTeam[teamName] : undefined,
      leadContext: teamName ? s.leadContextByTeam[teamName] : undefined,
    }))
  );

  return useMemo(
    () => adapterRef.current.adapt(teamData, teamName, spawnStatuses, leadContext),
    [teamData, teamName, spawnStatuses, leadContext]
  );
}
