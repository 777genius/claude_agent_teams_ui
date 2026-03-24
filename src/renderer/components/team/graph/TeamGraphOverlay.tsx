/**
 * TeamGraphOverlay — full-screen overlay showing the agent graph.
 * Follows the exact ProjectEditorOverlay pattern (lazy-loaded, fixed z-50).
 */

import { useCallback } from 'react';
import { GraphView } from '@claude-teams/agent-graph';
import type { GraphEventPort, GraphDomainRef } from '@claude-teams/agent-graph';
import { useTeamGraphAdapter } from './useTeamGraphAdapter';

export interface TeamGraphOverlayProps {
  teamName: string;
  onClose: () => void;
  onPinAsTab?: () => void;
}

export function TeamGraphOverlay({
  teamName,
  onClose,
  onPinAsTab,
}: TeamGraphOverlayProps): React.JSX.Element {
  const graphData = useTeamGraphAdapter(teamName);

  const events: GraphEventPort = {
    onNodeClick: useCallback((_ref: GraphDomainRef) => {
      // Popover shown by GraphView internally
    }, []),
    onNodeDoubleClick: useCallback((ref: GraphDomainRef) => {
      // TODO: open TaskDetailDialog or MemberDetailDialog based on ref.kind
      console.log('Double-click:', ref);
    }, []),
    onSendMessage: useCallback((_memberName: string, _teamName: string) => {
      // TODO: open SendMessageDialog
    }, []),
    onOpenTaskDetail: useCallback((_taskId: string, _teamName: string) => {
      // TODO: open TaskDetailDialog
    }, []),
    onBackgroundClick: useCallback(() => {
      // Deselect handled by GraphView
    }, []),
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#050510' }}>
      <GraphView
        data={graphData}
        events={events}
        onRequestClose={onClose}
        onRequestPinAsTab={onPinAsTab}
        className="flex-1"
      />
    </div>
  );
}
