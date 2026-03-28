/**
 * GraphOverlay — HTML popovers positioned over Canvas nodes.
 * Uses camera worldToScreen transform for positioning.
 */

import { useCallback } from 'react';
import type { GraphNode } from '../ports/types';
import type { GraphEventPort } from '../ports/GraphEventPort';
import { getStateColor, getTaskStatusColor } from '../constants/colors';

export interface GraphOverlayProps {
  selectedNode: GraphNode | null;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  events?: GraphEventPort;
  onDeselect: () => void;
}

export function GraphOverlay({
  selectedNode,
  worldToScreen,
  events,
  onDeselect,
}: GraphOverlayProps): React.JSX.Element | null {
  if (!selectedNode) return null;

  const screenPos = worldToScreen(selectedNode.x ?? 0, selectedNode.y ?? 0);

  return (
    <div
      className="absolute z-20 pointer-events-auto"
      style={{
        left: `${screenPos.x + 20}px`,
        top: `${screenPos.y - 20}px`,
        transform: 'translateY(-50%)',
      }}
    >
      <NodePopover node={selectedNode} events={events} onClose={onDeselect} />
    </div>
  );
}

// ─── Node Popover ───────────────────────────────────────────────────────────

function NodePopover({
  node,
  events,
  onClose,
}: {
  node: GraphNode;
  events?: GraphEventPort;
  onClose: () => void;
}): React.JSX.Element {
  const handleAction = useCallback(
    (action: string) => {
      const ref = node.domainRef;
      switch (action) {
        case 'sendMessage':
          if (ref.kind === 'member' || ref.kind === 'lead') {
            events?.onSendMessage?.(ref.kind === 'member' ? ref.memberName : 'team-lead', ref.teamName);
          }
          break;
        case 'openDetail':
          if (ref.kind === 'task') events?.onOpenTaskDetail?.(ref.taskId, ref.teamName);
          else if (ref.kind === 'member') events?.onOpenMemberProfile?.(ref.memberName, ref.teamName);
          break;
        case 'openUrl':
          if (node.processUrl) window.open(node.processUrl, '_blank');
          break;
      }
      onClose();
    },
    [node, events, onClose],
  );

  const color = node.kind === 'task'
    ? getTaskStatusColor(node.taskStatus)
    : getStateColor(node.state);

  return (
    <div
      className="rounded-lg p-3 min-w-[180px] max-w-[260px] shadow-xl"
      style={{
        background: 'rgba(10, 15, 30, 0.9)',
        border: `1px solid ${color}40`,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: color }}
        />
        <span
          className="text-xs font-mono font-bold truncate"
          style={{ color: '#aaeeff' }}
        >
          {node.label}
        </span>
      </div>

      {/* Info */}
      {node.sublabel && (
        <div className="text-[10px] mb-2 truncate" style={{ color: '#66ccff90' }}>
          {node.sublabel}
        </div>
      )}
      {node.role && (
        <div className="text-[10px] mb-2" style={{ color: '#66ccff70' }}>
          {node.role}
        </div>
      )}

      {/* Status badges */}
      <div className="flex gap-1 mb-2 flex-wrap">
        <StatusBadge label={node.state} color={color} />
        {node.reviewState && node.reviewState !== 'none' && (
          <StatusBadge label={node.reviewState} color={getTaskStatusColor(node.taskStatus)} />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 mt-2">
        {(node.kind === 'member' || node.kind === 'lead') && (
          <ActionButton label="Message" onClick={() => handleAction('sendMessage')} />
        )}
        {(node.kind === 'task' || node.kind === 'member') && (
          <ActionButton label="Open" onClick={() => handleAction('openDetail')} />
        )}
        {node.kind === 'process' && node.processUrl && (
          <ActionButton label="Open URL" onClick={() => handleAction('openUrl')} />
        )}
      </div>
    </div>
  );
}

// ─── UI Primitives ──────────────────────────────────────────────────────────

function StatusBadge({ label, color }: { label: string; color: string }): React.JSX.Element {
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded font-mono"
      style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}
    >
      {label}
    </span>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="text-[10px] px-2 py-1 rounded font-mono cursor-pointer transition-colors"
      style={{
        background: 'rgba(100, 200, 255, 0.08)',
        border: '1px solid rgba(100, 200, 255, 0.15)',
        color: '#aaeeff',
      }}
    >
      {label}
    </button>
  );
}
