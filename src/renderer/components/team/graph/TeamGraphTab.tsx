/**
 * TeamGraphTab — wraps GraphView for use as a dedicated tab.
 */

import { useCallback } from 'react';
import { GraphView } from '@claude-teams/agent-graph';
import type { GraphEventPort, GraphDomainRef } from '@claude-teams/agent-graph';
import { useTeamGraphAdapter } from './useTeamGraphAdapter';

export interface TeamGraphTabProps {
  teamName: string;
}

export function TeamGraphTab({ teamName }: TeamGraphTabProps): React.JSX.Element {
  const graphData = useTeamGraphAdapter(teamName);

  const events: GraphEventPort = {
    onNodeDoubleClick: useCallback((ref: GraphDomainRef) => {
      console.log('Double-click in tab:', ref);
    }, []),
  };

  return (
    <div className="h-full w-full" style={{ background: '#050510' }}>
      <GraphView data={graphData} events={events} className="h-full w-full" />
    </div>
  );
}
