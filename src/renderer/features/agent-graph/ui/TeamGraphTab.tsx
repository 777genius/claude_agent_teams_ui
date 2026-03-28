/**
 * TeamGraphTab — wraps GraphView for use as a dedicated tab.
 */

import { useCallback } from 'react';

import { GraphView } from '@claude-teams/agent-graph';

import { useTeamGraphAdapter } from '../adapters/useTeamGraphAdapter';

import type { GraphDomainRef, GraphEventPort } from '@claude-teams/agent-graph';

export interface TeamGraphTabProps {
  teamName: string;
}

export const TeamGraphTab = ({ teamName }: TeamGraphTabProps): React.JSX.Element => {
  const graphData = useTeamGraphAdapter(teamName);

  const events: GraphEventPort = {
    onNodeDoubleClick: useCallback((ref: GraphDomainRef) => {
      console.log('Double-click in tab:', ref);
    }, []),
  };

  return (
    <div className="size-full" style={{ background: '#050510' }}>
      <GraphView data={graphData} events={events} className="size-full" />
    </div>
  );
};
