/**
 * GraphView — main orchestrator with UNIFIED RAF loop.
 *
 * ARCHITECTURE: One RAF loop that:
 *   1. Ticks d3-force simulation (updates node positions in refs)
 *   2. Updates particles and effects (in refs)
 *   3. Calls canvasRef.draw() imperatively (no React re-renders)
 *
 * React useState ONLY for: selectedNodeId, filters (user-facing UI state).
 * ALL animation state (positions, particles, effects, time) lives in refs.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { GraphDataPort } from '../ports/GraphDataPort';
import type { GraphEventPort } from '../ports/GraphEventPort';
import type { GraphConfigPort } from '../ports/GraphConfigPort';
import type { GraphNode } from '../ports/types';
import { GraphCanvas, type GraphCanvasHandle, type GraphDrawState } from './GraphCanvas';
import { GraphControls, type GraphFilterState } from './GraphControls';
import { GraphOverlay } from './GraphOverlay';
import { useGraphSimulation } from '../hooks/useGraphSimulation';
import { useGraphCamera } from '../hooks/useGraphCamera';
import { useGraphInteraction } from '../hooks/useGraphInteraction';
import { findNodeAt } from '../canvas/hit-detection';
import { ANIM_SPEED } from '../constants/canvas-constants';

export interface GraphViewProps {
  data: GraphDataPort;
  events?: GraphEventPort;
  config?: Partial<GraphConfigPort>;
  className?: string;
  onRequestClose?: () => void;
  onRequestPinAsTab?: () => void;
}

export function GraphView({
  data,
  events,
  config,
  className,
  onRequestClose,
  onRequestPinAsTab,
}: GraphViewProps): React.JSX.Element {
  // ─── React state (user-facing only) ─────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filters, setFilters] = useState<GraphFilterState>({
    showTasks: config?.showTasks ?? true,
    showProcesses: config?.showProcesses ?? true,
    showEdges: true,
    paused: !(config?.animationEnabled ?? true),
  });

  // Force re-render for popover position updates
  const [, forceUpdate] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHandle = useRef<GraphCanvasHandle>(null);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const runningRef = useRef(false);

  // ─── Hooks ──────────────────────────────────────────────────────────────
  const simulation = useGraphSimulation();
  const camera = useGraphCamera();
  const interaction = useGraphInteraction(
    useCallback((nodeId: string, x: number, y: number) => {
      const state = simulation.stateRef.current;
      const node = state.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
        node.x = x;
        node.y = y;
      }
    }, [simulation.stateRef]),
  );

  // ─── Sync data from adapter → simulation ────────────────────────────────
  useEffect(() => {
    const filteredNodes = data.nodes.filter((n) => {
      if (n.kind === 'task' && !filters.showTasks) return false;
      if (n.kind === 'process' && !filters.showProcesses) return false;
      return true;
    });
    const filteredEdges = filters.showEdges
      ? data.edges
      : data.edges.filter((e) => e.type === 'parent-child');
    simulation.updateData(filteredNodes, filteredEdges, data.particles);
  }, [data, filters.showTasks, filters.showProcesses, filters.showEdges, simulation]);

  // ─── UNIFIED RAF LOOP: tick simulation + draw canvas ────────────────────
  const idleFrameSkip = useRef(0);

  const animate = useCallback(() => {
    if (!runningRef.current) return;

    const now = performance.now() / 1000;
    const dt = Math.min(
      lastTimeRef.current > 0 ? now - lastTimeRef.current : ANIM_SPEED.defaultDeltaTime,
      ANIM_SPEED.maxDeltaTime,
    );
    lastTimeRef.current = now;

    // 1. Tick simulation
    simulation.tick(dt);

    // 2. Update camera inertia
    camera.updateInertia();

    // 3. Adaptive frame rate: skip every other frame when idle (no particles, no effects, sim settled)
    const state = simulation.stateRef.current;
    const isIdle = state.particles.length === 0 && state.effects.length === 0;
    if (isIdle) {
      idleFrameSkip.current++;
      if (idleFrameSkip.current % 2 !== 0) {
        rafRef.current = requestAnimationFrame(animate);
        return; // skip draw, halve fps when idle
      }
    } else {
      idleFrameSkip.current = 0;
    }

    // 4. Draw canvas imperatively (NO React re-render)
    canvasHandle.current?.draw({
      nodes: state.nodes,
      edges: state.edges,
      particles: state.particles,
      effects: state.effects,
      time: state.time,
      camera: camera.transformRef.current,
      selectedNodeId,
      hoveredNodeId: interaction.hoveredNodeId.current,
    });

    rafRef.current = requestAnimationFrame(animate);
  }, [simulation, camera, selectedNodeId, interaction.hoveredNodeId]);

  // Start/stop RAF
  useEffect(() => {
    if (!filters.paused) {
      runningRef.current = true;
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    }
    return () => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [filters.paused, animate]);

  // ─── Auto-fit: center graph immediately when data arrives ──────────────
  const hasAutoFit = useRef(false);
  useEffect(() => {
    if (data.nodes.length > 0 && !hasAutoFit.current) {
      hasAutoFit.current = true;
      // Immediate fit (simulation already settled from 120 pre-ticks)
      const el = containerRef.current;
      if (el) {
        camera.zoomToFit(simulation.stateRef.current.nodes, el.clientWidth, el.clientHeight);
      }
      // Second fit after mount stabilizes (ResizeObserver may fire late)
      const timer = setTimeout(() => {
        if (el) {
          camera.zoomToFit(simulation.stateRef.current.nodes, el.clientWidth, el.clientHeight);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [data.nodes.length, camera, simulation.stateRef]);

  // ─── Mouse handlers (Figma-style: drag empty space = pan, drag node = move) ─
  const isPanningRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click

    const canvas = canvasHandle.current?.getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const world = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // Check if we hit a node
    interaction.handleMouseDown(world.x, world.y, simulation.stateRef.current.nodes);

    if (interaction.dragNodeId.current) {
      // Hit a node → will drag it
      isPanningRef.current = false;
    } else {
      // Hit empty space → pan
      isPanningRef.current = true;
      camera.handlePanStart(e.clientX, e.clientY);
    }
  }, [camera, interaction, simulation.stateRef]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Dragging with left button held
    if (e.buttons & 1) {
      if (isPanningRef.current) {
        camera.handlePanMove(e.clientX, e.clientY);
        return;
      }
      const canvas = canvasHandle.current?.getCanvas();
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const world = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      interaction.handleMouseMove(world.x, world.y, simulation.stateRef.current.nodes);
      return;
    }

    // No button held — hover detection + cursor update
    const canvas = canvasHandle.current?.getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const world = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    interaction.hoveredNodeId.current = findNodeAt(world.x, world.y, simulation.stateRef.current.nodes);
    canvas.style.cursor = interaction.hoveredNodeId.current ? 'pointer' : 'grab';
  }, [camera, interaction, simulation.stateRef]);

  const handleMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      camera.handlePanEnd();
      isPanningRef.current = false;
      return;
    }

    const clickedId = interaction.handleMouseUp();
    if (clickedId) {
      setSelectedNodeId(clickedId);
      forceUpdate((n) => n + 1);
      const node = simulation.stateRef.current.nodes.find((n) => n.id === clickedId);
      if (node) events?.onNodeClick?.(node.domainRef);
    } else if (!interaction.isDragging.current) {
      setSelectedNodeId(null);
      events?.onBackgroundClick?.();
    }
  }, [interaction, simulation.stateRef, events, camera]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasHandle.current?.getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const world = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const nodeId = interaction.handleDoubleClick(world.x, world.y, simulation.stateRef.current.nodes);
    if (nodeId) {
      const node = simulation.stateRef.current.nodes.find((n) => n.id === nodeId);
      if (node) {
        // Unpin if pinned (toggle)
        if (node.fx != null) {
          node.fx = null;
          node.fy = null;
        }
        events?.onNodeDoubleClick?.(node.domainRef);
      }
    }
  }, [camera, interaction, simulation.stateRef, events]);

  // ─── Keyboard ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture from inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === 'Escape') {
        if (selectedNodeId) {
          setSelectedNodeId(null);
        } else {
          onRequestClose?.();
        }
      }
      if (e.key === 'f' || e.key === 'F') {
        const el = containerRef.current;
        if (el) camera.zoomToFit(simulation.stateRef.current.nodes, el.clientWidth, el.clientHeight);
      }
      if (e.key === ' ') {
        e.preventDefault();
        setFilters((f) => ({ ...f, paused: !f.paused }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, onRequestClose, camera, simulation.stateRef]);

  // ─── Selected node for overlay ──────────────────────────────────────────
  const selectedNode: GraphNode | null =
    selectedNodeId
      ? simulation.stateRef.current.nodes.find((n) => n.id === selectedNodeId) ?? null
      : null;

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`relative w-full h-full ${className ?? ''}`}>
      <GraphCanvas
        ref={canvasHandle}
        showHexGrid={config?.showHexGrid ?? true}
        showStarField={config?.showStarField ?? true}
        bloomIntensity={config?.bloomIntensity ?? 0.6}
        onWheel={camera.handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />

      <GraphControls
        filters={filters}
        onFiltersChange={setFilters}
        onZoomIn={camera.zoomIn}
        onZoomOut={camera.zoomOut}
        onZoomToFit={() => {
          const el = containerRef.current;
          if (el) camera.zoomToFit(simulation.stateRef.current.nodes, el.clientWidth, el.clientHeight);
        }}
        onRequestClose={onRequestClose}
        onRequestPinAsTab={onRequestPinAsTab}
        teamName={data.teamName}
        isAlive={data.isAlive}
      />

      <GraphOverlay
        selectedNode={selectedNode}
        worldToScreen={camera.worldToScreen}
        events={events}
        onDeselect={() => setSelectedNodeId(null)}
      />
    </div>
  );
}
