/**
 * GraphControls — floating toolbar over the canvas.
 * Zoom, fit, filter toggles, pause, pin-as-tab, close.
 */

import { useCallback } from 'react';

export interface GraphFilterState {
  showTasks: boolean;
  showProcesses: boolean;
  showEdges: boolean;
  paused: boolean;
}

export interface GraphControlsProps {
  filters: GraphFilterState;
  onFiltersChange: (filters: GraphFilterState) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onRequestClose?: () => void;
  onRequestPinAsTab?: () => void;
  teamName: string;
  isAlive?: boolean;
}

export function GraphControls({
  filters,
  onFiltersChange,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onRequestClose,
  onRequestPinAsTab,
  teamName,
  isAlive,
}: GraphControlsProps): React.JSX.Element {
  const toggle = useCallback(
    (key: keyof GraphFilterState) => {
      onFiltersChange({ ...filters, [key]: !filters[key] });
    },
    [filters, onFiltersChange],
  );

  return (
    <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
      {/* Left: title + status */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(8, 12, 24, 0.85)', border: '1px solid rgba(100, 200, 255, 0.1)' }}>
          {isAlive && (
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          )}
          <span style={{ color: '#aaeeff', fontSize: '12px', fontFamily: 'monospace' }}>
            {teamName}
          </span>
        </div>
      </div>

      {/* Center: filters */}
      <div className="flex items-center gap-1 pointer-events-auto">
        <ToolbarButton active={filters.showTasks} onClick={() => toggle('showTasks')} label="Tasks" />
        <ToolbarButton active={filters.showProcesses} onClick={() => toggle('showProcesses')} label="Proc" />
        <ToolbarButton active={filters.showEdges} onClick={() => toggle('showEdges')} label="Edges" />
        <div className="w-px h-4 mx-1" style={{ background: 'rgba(100, 200, 255, 0.1)' }} />
        <ToolbarButton active={!filters.paused} onClick={() => toggle('paused')} label={filters.paused ? '▶' : '⏸'} />
      </div>

      {/* Right: zoom + actions */}
      <div className="flex items-center gap-1 pointer-events-auto">
        <ToolbarButton onClick={onZoomOut} label="−" />
        <ToolbarButton onClick={onZoomToFit} label="⊡" />
        <ToolbarButton onClick={onZoomIn} label="+" />
        {onRequestPinAsTab && (
          <>
            <div className="w-px h-4 mx-1" style={{ background: 'rgba(100, 200, 255, 0.1)' }} />
            <ToolbarButton onClick={onRequestPinAsTab} label="⊞ Pin" />
          </>
        )}
        {onRequestClose && (
          <ToolbarButton onClick={onRequestClose} label="✕" />
        )}
      </div>
    </div>
  );
}

// ─── Toolbar Button ─────────────────────────────────────────────────────────

function ToolbarButton({
  active,
  onClick,
  label,
}: {
  active?: boolean;
  onClick?: () => void;
  label: string;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded text-xs font-mono transition-colors"
      style={{
        background: active ? 'rgba(100, 200, 255, 0.15)' : 'rgba(100, 200, 255, 0.05)',
        border: '1px solid rgba(100, 200, 255, 0.1)',
        color: active ? '#aaeeff' : '#66ccff90',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
