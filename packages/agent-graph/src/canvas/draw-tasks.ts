/**
 * Task pill-shaped node rendering.
 * NEW — not from agent-flow. Custom renderer for our task nodes.
 */

import type { GraphNode } from '../ports/types';
import { COLORS, getTaskStatusColor, getReviewStateColor, alphaHex } from '../constants/colors';
import { TASK_PILL, MIN_VISIBLE_OPACITY, ANIM } from '../constants/canvas-constants';
import { truncateText } from './draw-misc';

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
  if (node.taskStatus === 'completed') return 0.5;
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

  // Breathing for in_progress tasks
  const isActive = node.taskStatus === 'in_progress';
  const breathe = isActive
    ? 1 + ANIM.breathe.activeAmp * Math.sin(time * ANIM.breathe.activeSpeed)
    : 1;
  const scale = breathe;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Shadow
  ctx.shadowColor = statusColor + '40';
  ctx.shadowBlur = isActive ? 12 : 6;

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
  ctx.strokeStyle = isSelected ? statusColor + 'CC' : statusColor + '80';
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.stroke();

  // Review state overlay border
  if (reviewColor !== 'transparent') {
    ctx.beginPath();
    ctx.roundRect(-halfW - 1, -halfH - 1, w + 2, h + 2, r + 1);
    ctx.strokeStyle = reviewColor + alphaHex(0.5 + 0.3 * Math.sin(time * 3));
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Clarification warning indicator
  if (node.needsClarification) {
    const pulseAlpha = 0.4 + 0.4 * Math.sin(time * 4);
    ctx.beginPath();
    ctx.roundRect(-halfW - 2, -halfH - 2, w + 4, h + 4, r + 2);
    ctx.strokeStyle = COLORS.error + alphaHex(pulseAlpha);
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
  const displayId = node.displayId ?? node.id.slice(0, 6);
  ctx.font = `bold ${TASK_PILL.idFontSize}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.textPrimary;
  ctx.fillText(displayId, -halfW + TASK_PILL.textOffsetX, -4);

  // Subject text
  if (node.sublabel) {
    ctx.font = `${TASK_PILL.subjectFontSize}px sans-serif`;
    ctx.fillStyle = COLORS.textDim;
    const maxW = w - TASK_PILL.textOffsetX - 8;
    const subject = truncateText(ctx, node.sublabel, maxW, ctx.font);
    ctx.fillText(subject, -halfW + TASK_PILL.textOffsetX, 8);
  }

  ctx.restore();
}
