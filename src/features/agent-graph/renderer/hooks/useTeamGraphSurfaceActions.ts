import { useCallback } from 'react';

import { useStore } from '@renderer/store';

import { parseGraphMemberNodeId } from '../../core/domain/graphOwnerIdentity';

import type { GraphOwnerSlotAssignment } from '@claude-teams/agent-graph';

export function useTeamGraphSurfaceActions(teamName: string): {
  openTeamPage: () => void;
  commitOwnerSlotDrop: (payload: {
    nodeId: string;
    assignment: GraphOwnerSlotAssignment;
    displacedNodeId?: string;
    displacedAssignment?: GraphOwnerSlotAssignment;
  }) => void;
} {
  const openTeamPage = useCallback(() => {
    useStore.getState().openTeamTab(teamName);
  }, [teamName]);

  const commitOwnerSlotDrop = useCallback(
    (payload: {
      nodeId: string;
      assignment: GraphOwnerSlotAssignment;
      displacedNodeId?: string;
      displacedAssignment?: GraphOwnerSlotAssignment;
    }) => {
      const stableOwnerId = parseGraphMemberNodeId(payload.nodeId, teamName);
      if (!stableOwnerId) {
        return;
      }
      const displacedStableOwnerId = payload.displacedNodeId
        ? parseGraphMemberNodeId(payload.displacedNodeId, teamName)
        : null;
      const store = useStore.getState();
      if (displacedStableOwnerId && payload.displacedAssignment) {
        store.commitTeamGraphOwnerSlotDrop(
          teamName,
          stableOwnerId,
          payload.assignment,
          displacedStableOwnerId,
          payload.displacedAssignment
        );
        return;
      }
      store.setTeamGraphOwnerSlotAssignment(teamName, stableOwnerId, payload.assignment);
    },
    [teamName]
  );

  return {
    openTeamPage,
    commitOwnerSlotDrop,
  };
}
