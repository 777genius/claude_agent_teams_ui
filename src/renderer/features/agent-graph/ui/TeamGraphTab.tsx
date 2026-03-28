/**
 * TeamGraphTab — wraps GraphView for use as a dedicated tab.
 * Provides Fullscreen button that opens the overlay.
 */

import { useCallback, useState, lazy, Suspense } from 'react';

import { GraphView } from '@claude-teams/agent-graph';

import { useTeamGraphAdapter } from '../adapters/useTeamGraphAdapter';

import type { GraphDomainRef, GraphEventPort } from '@claude-teams/agent-graph';

const TeamGraphOverlay = lazy(() =>
  import('./TeamGraphOverlay').then((m) => ({ default: m.TeamGraphOverlay }))
);

export interface TeamGraphTabProps {
  teamName: string;
}

export const TeamGraphTab = ({ teamName }: TeamGraphTabProps): React.JSX.Element => {
  const graphData = useTeamGraphAdapter(teamName);
  const [fullscreen, setFullscreen] = useState(false);

  const events: GraphEventPort = {
    onNodeDoubleClick: useCallback(
      (ref: GraphDomainRef) => {
        // Dispatch to TeamDetailView's dialog system via CustomEvent
        if (ref.kind === 'task') {
          window.dispatchEvent(
            new CustomEvent('graph:open-task', { detail: { teamName, taskId: ref.taskId } })
          );
        } else if (ref.kind === 'member') {
          window.dispatchEvent(
            new CustomEvent('graph:send-message', {
              detail: { teamName, memberName: ref.memberName },
            })
          );
        }
      },
      [teamName]
    ),
    onSendMessage: useCallback(
      (memberName: string) => {
        window.dispatchEvent(
          new CustomEvent('graph:send-message', { detail: { teamName, memberName } })
        );
      },
      [teamName]
    ),
    onOpenTaskDetail: useCallback(
      (taskId: string) => {
        window.dispatchEvent(new CustomEvent('graph:open-task', { detail: { teamName, taskId } }));
      },
      [teamName]
    ),
    onOpenMemberProfile: useCallback(
      (memberName: string) => {
        window.dispatchEvent(
          new CustomEvent('graph:send-message', { detail: { teamName, memberName } })
        );
      },
      [teamName]
    ),
  };

  return (
    <div className="size-full" style={{ background: '#050510' }}>
      <GraphView
        data={graphData}
        events={events}
        className="size-full"
        onRequestFullscreen={() => setFullscreen(true)}
      />
      {fullscreen && (
        <Suspense fallback={null}>
          <TeamGraphOverlay teamName={teamName} onClose={() => setFullscreen(false)} />
        </Suspense>
      )}
    </div>
  );
};
