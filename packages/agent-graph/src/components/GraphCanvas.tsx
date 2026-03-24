/**
 * GraphCanvas — Canvas 2D rendering component with imperative RAF draw loop.
 *
 * ARCHITECTURE: The canvas draws imperatively via drawRef, NOT via React re-renders.
 * GraphView calls `drawRef.current()` from the unified RAF loop.
 * React only manages: mount/unmount, resize, mouse events.
 */

import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { GraphNode, GraphEdge, GraphParticle } from '../ports/types';
import { drawBackground, createDepthParticles, updateDepthParticles, type DepthParticle } from '../canvas/background-layer';
import { drawEdges } from '../canvas/draw-edges';
import { drawParticles, buildEdgeMap } from '../canvas/draw-particles';
import { drawAgents } from '../canvas/draw-agents';
import { drawTasks } from '../canvas/draw-tasks';
import { drawProcesses } from '../canvas/draw-processes';
import { drawEffects, type VisualEffect } from '../canvas/draw-effects';
import { BloomRenderer } from '../canvas/bloom-renderer';
import type { CameraTransform } from '../hooks/useGraphCamera';

// ─── Draw State (passed by ref, not by props — no React re-renders) ─────────

export interface GraphDrawState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  particles: GraphParticle[];
  effects: VisualEffect[];
  time: number;
  camera: CameraTransform;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
}

export interface GraphCanvasHandle {
  /** Call this from RAF to draw one frame */
  draw: (state: GraphDrawState) => void;
  /** Get the canvas element for coordinate transforms */
  getCanvas: () => HTMLCanvasElement | null;
}

export interface GraphCanvasProps {
  showHexGrid?: boolean;
  showStarField?: boolean;
  bloomIntensity?: number;
  onWheel?: (e: WheelEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  {
    showHexGrid = true,
    showStarField = true,
    bloomIntensity = 0.6,
    onWheel,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDoubleClick,
    onContextMenu,
    className,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<BloomRenderer>(new BloomRenderer(bloomIntensity));
  const starsRef = useRef<DepthParticle[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Update bloom intensity without recreating
  useEffect(() => {
    bloomRef.current.setIntensity(bloomIntensity);
  }, [bloomIntensity]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        if (!canvas) continue;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        sizeRef.current = { w: width, h: height };
        bloomRef.current.resize(width * dpr, height * dpr);
        starsRef.current = createDepthParticles(width, height);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Imperative draw function — called from RAF, NOT from React render
  useImperativeHandle(ref, () => ({
    draw: (state: GraphDrawState) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // 1. Background (screen space)
      updateDepthParticles(starsRef.current, w, h, state.time > 0 ? 0.016 : 0);
      drawBackground(ctx, w, h, starsRef.current, state.camera, state.time, {
        showHexGrid,
        showStarField,
      });

      // 2. World-space content
      ctx.save();
      ctx.translate(state.camera.x, state.camera.y);
      ctx.scale(state.camera.zoom, state.camera.zoom);

      const nodeMap = new Map<string, GraphNode>();
      for (const n of state.nodes) nodeMap.set(n.id, n);
      const edgeMap = buildEdgeMap(state.edges);
      const activeParticleEdges = new Set(state.particles.map((p) => p.edgeId));

      // 2a. Edges
      drawEdges(ctx, state.edges, nodeMap, state.time, activeParticleEdges);

      // 2b. Particles
      drawParticles(ctx, state.particles, edgeMap, nodeMap, state.time);

      // 2c. Nodes (back to front: process → task → member/lead)
      drawProcesses(ctx, state.nodes, state.time, state.selectedNodeId, state.hoveredNodeId);
      drawTasks(ctx, state.nodes, state.time, state.selectedNodeId, state.hoveredNodeId);
      drawAgents(ctx, state.nodes, state.time, state.selectedNodeId, state.hoveredNodeId);

      // 2d. Effects
      drawEffects(ctx, state.effects);

      ctx.restore(); // world space
      ctx.restore(); // DPR scale

      // 3. Bloom post-processing
      if (bloomIntensity > 0) {
        bloomRef.current.apply(canvas, ctx);
      }
    },
    getCanvas: () => canvasRef.current,
  }), [showHexGrid, showStarField, bloomIntensity]);

  // Wheel handler (passive: false required for preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onWheel) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      onWheel(e);
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [onWheel]);

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: 'crosshair' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      />
    </div>
  );
});
