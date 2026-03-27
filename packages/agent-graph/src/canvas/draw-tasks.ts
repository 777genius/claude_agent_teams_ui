/**
 * Task pill-shaped node rendering.
 * NEW — not from agent-flow. Custom renderer for our task nodes.
 */

import type { GraphNode } from '../ports/types';
import { COLORS, getTaskStatusColor, getReviewStateColor } from '../constants/colors';
import { TASK_PILL, MIN_VISIBLE_OPACITY, ANIM } from '../constants/canvas-constants';
import { truncateText } from './draw-misc';
import { hexWithAlpha } from './render-cache';

/**
 * Draw all task nodes as pill-shaped cards.
 */
export function drawTasks(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  time: number,
  selectedId: string | null,
  hoveredId: string | null,
): void {
  for (const node of nodes) {
    if (node.kind !== 'task') continue;

    const opacity = getTaskOpacity(node);
    if (opacity < MIN_VISIBLE_OPACITY) continue;

    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const isSelected = node.id === selectedId;
    const isHovered = node.id === hoveredId;

    ctx.save();
    ctx.globalAlpha = opacity;

    drawTaskPill(ctx, x, y, node, time, isSelected, isHovered);

    ctx.restore();
  }
}

// ─── Private ────────────────────────────────────────────────────────────────

function getTaskOpacity(node: GraphNode): number {
  if (node.taskStatus === 'deleted') return 0;
  if (node.reviewState === 'approved') return 0.65;
  if (node.taskStatus === 'completed') return 0.45;
  return 1;
}

function drawTaskPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  node: GraphNode,
  time: number,
  isSelected: boolean,
  isHovered: boolean,
): void {
  const w = TASK_PILL.width;
  const h = TASK_PILL.height;
  const r = TASK_PILL.borderRadius;
  const halfW = w / 2;
  const halfH = h / 2;

  const statusColor = getTaskStatusColor(node.taskStatus);
  const reviewColor = getReviewStateColor(node.reviewState);

  // Pulse only for active work — completed + approved = static
  const needsAttention =
    (node.taskStatus === 'in_progress' && node.reviewState !== 'approved') ||
    node.reviewState === 'review' ||
    node.reviewState === 'needsFix' ||
    (node.needsClarification != null);
  const isFinished = node.taskStatus === 'completed' || node.reviewState === 'approved';
  const breathe = needsAttention && !isFinished
    ? 1 + ANIM.breathe.activeAmp * Math.sin(time * ANIM.breathe.activeSpeed)
    : 1;
  const scale = breathe;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Shadow — stronger for attention tasks
  ctx.shadowColor = hexWithAlpha(statusColor, 0.25);
  ctx.shadowBlur = needsAttention ? 12 : 4;

  // Background fill
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfH, w, h, r);
  ctx.fillStyle = isSelected
    ? COLORS.cardBgSelected
    : isHovered
      ? 'rgba(15, 20, 40, 0.7)'
      : COLORS.cardBg;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Border
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfH, w, h, r);
  ctx.strokeStyle = hexWithAlpha(statusColor, isSelected ? 0.8 : 0.5);
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.stroke();

  // Review state overlay border — pulsing for review/needsFix, STATIC for approved
  if (reviewColor !== 'transparent') {
    ctx.beginPath();
    ctx.roundRect(-halfW - 1, -halfH - 1, w + 2, h + 2, r + 1);
    const reviewAlpha = node.reviewState === 'approved'
      ? 0.6  // static — no pulse
      : 0.5 + 0.3 * Math.sin(time * 3); // pulsing for review/needsFix
    ctx.strokeStyle = hexWithAlpha(reviewColor, reviewAlpha);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Clarification warning indicator
  if (node.needsClarification) {
    const pulseAlpha = 0.4 + 0.4 * Math.sin(time * 4);
    ctx.beginPath();
    ctx.roundRect(-halfW - 2, -halfH - 2, w + 4, h + 4, r + 2);
    ctx.strokeStyle = hexWithAlpha(COLORS.error, pulseAlpha);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Status dot
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(
    -halfW + TASK_PILL.statusDotX,
    0,
    TASK_PILL.statusDotRadius,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Display ID
  const displayId = node.displayId ?? node.label;
  ctx.font = `bold ${TASK_PILL.idFontSize}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isFinished ? COLORS.textDim : COLORS.textPrimary;
  ctx.fillText(displayId, -halfW + TASK_PILL.textOffsetX, -4);

  // Subject text
  if (node.sublabel) {
    ctx.font = `${TASK_PILL.subjectFontSize}px sans-serif`;
    ctx.fillStyle = isFinished ? COLORS.textMuted : COLORS.textDim;
    const maxW = w - TASK_PILL.textOffsetX - 8;
    const subject = truncateText(ctx, node.sublabel, maxW, ctx.font);
    ctx.fillText(subject, -halfW + TASK_PILL.textOffsetX, 8);
  }

  // Approved badge: checkmark at right side
  if (node.reviewState === 'approved') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.reviewApproved;
    ctx.fillText('\u2713', halfW - 8, 0); // ✓
  }

  // Completed: subtle strikethrough line
  if (node.taskStatus === 'completed' && node.reviewState !== 'approved') {
    ctx.beginPath();
    ctx.moveTo(-halfW + TASK_PILL.textOffsetX, 0);
    ctx.lineTo(halfW - 10, 0);
    ctx.strokeStyle = COLORS.textMuted;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  ctx.restore();
}
