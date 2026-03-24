/**
 * Process node rendering — small circles for running processes.
 * NEW — not from agent-flow.
 */

import type { GraphNode } from '../ports/types';
import { COLORS } from '../constants/colors';
import { NODE } from '../constants/canvas-constants';

/**
 * Draw all process nodes as small circles.
 */
export function drawProcesses(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  time: number,
  selectedId: string | null,
  hoveredId: string | null,
): void {
  for (const node of nodes) {
    if (node.kind !== 'process') continue;

    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const r = NODE.radiusProcess;
    const isSelected = node.id === selectedId;
    const isHovered = node.id === hoveredId;

    ctx.save();
    ctx.globalAlpha = 0.8;

    // Glow
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    grad.addColorStop(0, (node.color ?? COLORS.tool_calling) + '30');
    grad.addColorStop(1, (node.color ?? COLORS.tool_calling) + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? COLORS.cardBgSelected : COLORS.cardBg;
    ctx.fill();
    ctx.strokeStyle = (node.color ?? COLORS.tool_calling) + (isHovered ? 'CC' : '80');
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    // Spinning ring for active processes
    const spinAngle = time * 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, spinAngle, spinAngle + Math.PI * 0.8);
    ctx.strokeStyle = (node.color ?? COLORS.tool_calling) + '60';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.textDim;
    const label = node.label.length > 12 ? node.label.slice(0, 12) + '...' : node.label;
    ctx.fillText(label, x, y + r + 4);

    ctx.restore();
  }
}
