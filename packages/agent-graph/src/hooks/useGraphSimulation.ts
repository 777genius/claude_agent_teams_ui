/**
 * Graph simulation hook using d3-force.
 * CRITICAL: Animation state in useRef, NOT useState — no React re-renders at 60fps.
 *
 * This hook does NOT run its own RAF loop — the parent (GraphView) calls tick() from
 * its unified RAF loop which also draws the canvas imperatively.
 */

import { useRef, useEffect, useCallback } from 'react';
import {
  forceSimulation,
  forceCenter,
  forceManyBody,
  forceCollide,
  forceLink,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { GraphNode, GraphEdge, GraphParticle, GraphNodeKind } from '../ports/types';
import { FORCE, ANIM_SPEED } from '../constants/canvas-constants';
import { getNodeStrategy } from '../strategies';
import { createSpawnEffect, createCompleteEffect, type VisualEffect } from '../canvas/draw-effects';
import { getStateColor } from '../constants/colors';

// ─── Force Node/Link types (properly typed, no loose `string`) ──────────────

interface ForceNode extends SimulationNodeDatum {
  id: string;
  kind: GraphNodeKind;
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
  id: string;
  edgeType: string;
}

// ─── Simulation State (in ref, not useState) ────────────────────────────────

export interface SimulationState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  particles: GraphParticle[];
  effects: VisualEffect[];
  time: number;
}

export interface UseGraphSimulationResult {
  stateRef: React.MutableRefObject<SimulationState>;
  updateData: (nodes: GraphNode[], edges: GraphEdge[], particles: GraphParticle[]) => void;
  /** Tick one simulation frame — called from parent's RAF loop */
  tick: (dt: number) => void;
}

// ─── Custom Radial Force (tasks orbit owner) ────────────────────────────────

function applyTaskOrbitForce(nodes: GraphNode[], strength: number, radius: number): void {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  for (const node of nodes) {
    if (node.kind !== 'task' || !node.ownerId) continue;
    const owner = nodeMap.get(node.ownerId);
    if (!owner || owner.x == null || owner.y == null) continue;
    if (node.x == null || node.y == null) continue;

    const dx = node.x - owner.x;
    const dy = node.y - owner.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const diff = dist - radius;

    const fx = (dx / dist) * diff * strength;
    const fy = (dy / dist) * diff * strength;
    node.vx = (node.vx ?? 0) - fx;
    node.vy = (node.vy ?? 0) - fy;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useGraphSimulation(): UseGraphSimulationResult {
  const stateRef = useRef<SimulationState>({
    nodes: [],
    edges: [],
    particles: [],
    effects: [],
    time: 0,
  });

  const simRef = useRef<Simulation<ForceNode, ForceLink> | null>(null);

  // Initialize d3-force simulation
  const initSimulation = useCallback(() => {
    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation<ForceNode, ForceLink>([])
      .force('center', forceCenter(0, 0).strength(FORCE.centerStrength))
      .force('charge', forceManyBody<ForceNode>().strength((d) => {
        return getNodeStrategy(d.kind).getChargeStrength();
      }))
      .force('collide', forceCollide<ForceNode>().radius((d) => {
        return getNodeStrategy(d.kind).getCollisionRadius();
      }))
      .force('link', forceLink<ForceNode, ForceLink>([]).id((d) => d.id).distance((d) => {
        return FORCE.linkDistance[d.edgeType as keyof typeof FORCE.linkDistance] ?? 200;
      }).strength(FORCE.linkStrength))
      .alphaDecay(FORCE.alphaDecay)
      .velocityDecay(FORCE.velocityDecay)
      .stop(); // We tick manually

    simRef.current = sim;
    return sim;
  }, []);

  // Sync graph data to d3-force
  const syncSimulation = useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    let sim = simRef.current;
    if (!sim) sim = initSimulation();

    const forceNodes: ForceNode[] = nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      x: n.x ?? (Math.random() - 0.5) * 500,
      y: n.y ?? (Math.random() - 0.5) * 500,
      vx: n.vx ?? 0,
      vy: n.vy ?? 0,
      fx: n.fx,
      fy: n.fy,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const forceLinks: ForceLink[] = edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        edgeType: e.type,
      }));

    sim.nodes(forceNodes);
    (sim.force('link') as ReturnType<typeof forceLink>)?.links(forceLinks);
    sim.alpha(1);

    // Run simulation to near-completion so nodes are settled on first render
    for (let i = 0; i < 120; i++) sim.tick();
    sim.alpha(0); // fully settled — no more movement until new data
  }, [initSimulation]);

  // Track previous node IDs and states for effect spawning
  const prevNodeIdsRef = useRef(new Set<string>());
  const prevNodeStatesRef = useRef(new Map<string, string>());

  // Update data from adapter
  const updateData = useCallback((nodes: GraphNode[], edges: GraphEdge[], particles: GraphParticle[]) => {
    const state = stateRef.current;
    const prevIds = prevNodeIdsRef.current;
    const prevStates = prevNodeStatesRef.current;

    // Preserve positions from previous frame
    const prevPositions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    for (const n of state.nodes) {
      if (n.x != null && n.y != null) {
        prevPositions.set(n.id, { x: n.x, y: n.y, vx: n.vx ?? 0, vy: n.vy ?? 0 });
      }
    }

    for (const n of nodes) {
      const prev = prevPositions.get(n.id);
      if (prev && n.x == null) {
        n.x = prev.x;
        n.y = prev.y;
        n.vx = prev.vx;
        n.vy = prev.vy;
      }
    }

    // Detect state transitions → spawn visual effects
    for (const node of nodes) {
      // New node appeared → spawn effect
      if (!prevIds.has(node.id) && node.x != null && node.y != null) {
        state.effects.push(createSpawnEffect(node.x, node.y, node.color ?? getStateColor(node.state)));
      }

      // Task completed → shatter effect
      const prevState = prevStates.get(node.id);
      if (prevState && prevState !== 'complete' && node.state === 'complete' && node.x != null && node.y != null) {
        state.effects.push(createCompleteEffect(node.x, node.y, node.color ?? getStateColor(node.state)));
      }
    }

    // Update tracking refs
    prevNodeIdsRef.current = new Set(nodes.map((n) => n.id));
    prevNodeStatesRef.current = new Map(nodes.map((n) => [n.id, n.state]));

    state.nodes = nodes;
    state.edges = edges;
    state.particles = particles;

    syncSimulation(nodes, edges);
  }, [syncSimulation]);

  // Tick one frame (called by parent's RAF loop)
  const tick = useCallback((dt: number) => {
    tickFrame(stateRef.current, simRef.current, dt);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      simRef.current?.stop();
    };
  }, []);

  return { stateRef, updateData, tick };
}

// ─── Frame Tick (pure function) ─────────────────────────────────────────────

function tickFrame(
  state: SimulationState,
  sim: Simulation<ForceNode, ForceLink> | null,
  dt: number,
): void {
  state.time += dt;

  // Tick d3-force (only when simulation is still active)
  if (sim && sim.alpha() > 0.001) {
    sim.tick(1);

    const simNodes = sim.nodes();
    const simNodeMap = new Map<string, ForceNode>();
    for (const sn of simNodes) simNodeMap.set(sn.id, sn);

    for (const node of state.nodes) {
      const sn = simNodeMap.get(node.id);
      if (sn) {
        node.x = sn.x;
        node.y = sn.y;
        node.vx = sn.vx;
        node.vy = sn.vy;
      }
    }
  }

  // Custom task orbit force
  applyTaskOrbitForce(state.nodes, FORCE.taskOrbitStrength, FORCE.taskOrbitRadius);

  // Update particle progress
  for (const p of state.particles) {
    p.progress += dt * ANIM_SPEED.particleSpeed * 0.5;
  }
  state.particles = state.particles.filter((p) => p.progress < 1);

  // Update effects
  for (const fx of state.effects) {
    fx.age += dt;
  }
  state.effects = state.effects.filter((fx) => fx.age < fx.duration);
}
