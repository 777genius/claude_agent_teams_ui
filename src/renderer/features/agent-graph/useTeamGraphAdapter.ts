/**
 * Adapter hook: transforms Zustand TeamData → GraphDataPort.
 * This is the ONLY file that bridges our domain model with the graph package.
 * If data model changes, ONLY this file needs updating.
 */

import { useMemo } from 'react';
import { useStore } from '@renderer/store';
import { useShallow } from 'zustand/react/shallow';
import type { GraphDataPort, GraphNode, GraphEdge, GraphParticle } from '@claude-teams/agent-graph';
import type { InboxMessage } from '@shared/types/team';
import { isLeadMember } from '@shared/utils/leadDetection';

/**
 * Adapt the Zustand store's TeamData into GraphDataPort for the visualization package.
 */
export function useTeamGraphAdapter(teamName: string): GraphDataPort {
  const { teamData, spawnStatuses, leadContext } = useStore(
    useShallow((s) => ({
      teamData: s.selectedTeamData,
      spawnStatuses: teamName ? s.memberSpawnStatusesByTeam[teamName] : undefined,
      leadContext: teamName ? s.leadContextByTeam[teamName] : undefined,
    }))
  );

  return useMemo((): GraphDataPort => {
    if (!teamData || teamData.teamName !== teamName) {
      return { nodes: [], edges: [], particles: [], teamName, isAlive: false };
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const particles: GraphParticle[] = [];
    const seenRelated = new Set<string>(); // dedup related edges

    // ─── Lead node ────────────────────────────────────────────────────────
    const leadId = `lead:${teamName}`;
    const contextPercent = leadContext?.percent;
    nodes.push({
      id: leadId,
      kind: 'lead',
      label: teamData.config.name || teamName,
      state: teamData.isAlive ? 'active' : 'idle',
      color: teamData.config.color ?? undefined,
      contextUsage:
        contextPercent != null ? Math.max(0, Math.min(1, contextPercent / 100)) : undefined,
      domainRef: { kind: 'lead', teamName },
    });

    // ─── Member nodes + parent-child edges ────────────────────────────────
    // Skip lead member to avoid duplicate node (lead already has its own node)
    for (const member of teamData.members) {
      if (member.removedAt) continue;
      if (isLeadMember(member)) continue; // prevent lead duplication

      const memberId = `member:${teamName}:${member.name}`;
      const spawn = spawnStatuses?.[member.name];

      nodes.push({
        id: memberId,
        kind: 'member',
        label: member.name,
        state: mapMemberStatus(member.status, spawn?.status),
        color: member.color ?? undefined,
        role: member.role ?? undefined,
        spawnStatus: spawn?.status,
        domainRef: { kind: 'member', teamName, memberName: member.name },
      });

      edges.push({
        id: `edge:parent:${leadId}:${memberId}`,
        source: leadId,
        target: memberId,
        type: 'parent-child',
      });
    }

    // ─── Task nodes + ownership/blocking/related edges ────────────────────
    for (const task of teamData.tasks) {
      if (task.status === 'deleted') continue;
      const taskId = `task:${teamName}:${task.id}`;
      const ownerMemberId = task.owner ? `member:${teamName}:${task.owner}` : null;

      nodes.push({
        id: taskId,
        kind: 'task',
        label: task.displayId ?? `#${task.id.slice(0, 6)}`,
        sublabel: task.subject,
        state: mapTaskStatus(task.status),
        taskStatus: mapTaskStatusLiteral(task.status),
        reviewState: mapReviewState(task.reviewState),
        displayId: task.displayId ?? undefined,
        ownerId: ownerMemberId,
        needsClarification: task.needsClarification ?? null,
        domainRef: { kind: 'task', teamName, taskId: task.id },
      });

      // Ownership edge
      if (ownerMemberId) {
        edges.push({
          id: `edge:own:${ownerMemberId}:${taskId}`,
          source: ownerMemberId,
          target: taskId,
          type: 'ownership',
        });
      }

      // Blocking edges (from blockedBy — task depends on blocker)
      for (const blockedById of task.blockedBy ?? []) {
        const blockerId = `task:${teamName}:${blockedById}`;
        edges.push({
          id: `edge:block:${blockerId}:${taskId}`,
          source: blockerId,
          target: taskId,
          type: 'blocking',
        });
      }

      // Blocks edges (from blocks — this task blocks others)
      for (const blocksId of task.blocks ?? []) {
        const blockedId = `task:${teamName}:${blocksId}`;
        const edgeId = `edge:block:${taskId}:${blockedId}`;
        // Avoid duplication with blockedBy from the other side
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: taskId,
            target: blockedId,
            type: 'blocking',
          });
        }
      }

      // Related edges (deduplicated: only create A→B, not B→A)
      for (const relatedId of task.related ?? []) {
        const canonicalKey = [task.id, relatedId].sort().join(':');
        if (seenRelated.has(canonicalKey)) continue;
        seenRelated.add(canonicalKey);

        edges.push({
          id: `edge:rel:${canonicalKey}`,
          source: taskId,
          target: `task:${teamName}:${relatedId}`,
          type: 'related',
        });
      }
    }

    // ─── Process nodes ────────────────────────────────────────────────────
    for (const proc of teamData.processes) {
      if (proc.stoppedAt) continue;
      const procId = `process:${teamName}:${proc.id}`;
      const registeredByMemberId = proc.registeredBy
        ? `member:${teamName}:${proc.registeredBy}`
        : null;

      nodes.push({
        id: procId,
        kind: 'process',
        label: proc.label,
        state: 'active',
        processUrl: proc.url ?? undefined,
        domainRef: { kind: 'process', teamName, processId: proc.id },
      });

      if (registeredByMemberId) {
        edges.push({
          id: `edge:proc:${registeredByMemberId}:${procId}`,
          source: registeredByMemberId,
          target: procId,
          type: 'ownership',
        });
      }
    }

    // ─── Message particles (RECENT messages → particles on edges) ─────────
    // Take LAST 20 messages (newest), use deterministic progress from timestamp
    const recentMessages = teamData.messages.slice(-20);
    for (const msg of recentMessages) {
      const particleEdge = resolveMessageEdge(msg, teamName, leadId, edges);
      if (particleEdge) {
        // Deterministic progress from timestamp hash (no Math.random in useMemo)
        const ts = typeof msg.timestamp === 'string' ? new Date(msg.timestamp).getTime() : 0;
        const progress = (ts % 800) / 1000; // 0..0.8 range, deterministic
        particles.push({
          id: `particle:msg:${msg.messageId ?? msg.timestamp}`,
          edgeId: particleEdge,
          progress,
          kind: 'message',
          color: msg.color ?? '#66ccff',
          label: msg.summary ?? undefined,
        });
      }
    }

    return {
      nodes,
      edges,
      particles,
      teamName,
      teamColor: teamData.config.color ?? undefined,
      isAlive: teamData.isAlive,
    };
  }, [teamData, teamName, spawnStatuses, leadContext]);
}

// ─── Status Mappers (safe, no `as` casts) ───────────────────────────────────

function mapMemberStatus(status: string, spawnStatus?: string): GraphNode['state'] {
  if (spawnStatus === 'spawning') return 'thinking';
  if (spawnStatus === 'error') return 'error';
  if (spawnStatus === 'waiting') return 'waiting';
  switch (status) {
    case 'active':
      return 'active';
    case 'idle':
      return 'idle';
    case 'terminated':
      return 'terminated';
    default:
      return 'idle';
  }
}

function mapTaskStatus(status: string): GraphNode['state'] {
  switch (status) {
    case 'pending':
      return 'waiting';
    case 'in_progress':
      return 'active';
    case 'completed':
      return 'complete';
    default:
      return 'idle';
  }
}

function mapTaskStatusLiteral(status: string): 'pending' | 'in_progress' | 'completed' | 'deleted' {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'deleted':
      return 'deleted';
    default:
      return 'pending';
  }
}

function mapReviewState(state: string | undefined): 'none' | 'review' | 'needsFix' | 'approved' {
  switch (state) {
    case 'review':
      return 'review';
    case 'needsFix':
      return 'needsFix';
    case 'approved':
      return 'approved';
    default:
      return 'none';
  }
}

// ─── Message → Edge Resolution ──────────────────────────────────────────────

/**
 * Resolve which edge a message particle should travel along.
 * Handles InboxMessage.to being undefined (~40-60% of messages from lead).
 */
function resolveMessageEdge(
  msg: InboxMessage,
  teamName: string,
  leadId: string,
  edges: GraphEdge[]
): string | null {
  const from = msg.from;
  const to = msg.to;

  if (from && to) {
    // Direct message — resolve both endpoints
    const fromId = resolveParticipantId(from, teamName, leadId);
    const toId = resolveParticipantId(to, teamName, leadId);
    const edge =
      edges.find((e) => e.source === fromId && e.target === toId) ??
      edges.find((e) => e.source === toId && e.target === fromId);
    return edge?.id ?? null;
  }

  if (from && !to) {
    // No explicit target — find edge connecting `from` to lead (broadcast heuristic)
    const fromId = resolveParticipantId(from, teamName, leadId);
    const edge = edges.find(
      (e) =>
        (e.source === leadId && e.target === fromId) || (e.source === fromId && e.target === leadId)
    );
    return edge?.id ?? null;
  }

  return null;
}

/** Map participant name to graph node ID, handling "user" and lead names */
function resolveParticipantId(name: string, teamName: string, leadId: string): string {
  if (name === 'user' || name === 'team-lead') return leadId;
  return `member:${teamName}:${name}`;
}
