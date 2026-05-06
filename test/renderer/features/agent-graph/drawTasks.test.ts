import { describe, expect, it, vi } from 'vitest';

import { drawTasks } from '../../../../packages/agent-graph/src/canvas/draw-tasks';

import type { GraphNode } from '@claude-teams/agent-graph';

function createMockContext() {
  const arcCalls: Array<{ x: number; y: number; radius: number }> = [];
  const gradient = { addColorStop: vi.fn() };
  let fillStyle: string | CanvasGradient | CanvasPattern = '';
  let globalAlpha = 1;

  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn((x: number, y: number, radius: number) => {
      arcCalls.push({ x, y, radius });
    }),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    setLineDash: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    roundRect: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    createLinearGradient: vi.fn(() => gradient),
    measureText: vi.fn((text: string) => ({ width: text.length * 4.5 })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      fillStyle = value;
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value: number) {
      globalAlpha = value;
    },
  } as unknown as CanvasRenderingContext2D;

  return { ctx, arcCalls };
}

function createTaskNode(hasLiveTaskLogs: boolean): GraphNode {
  return {
    id: 'task:demo:task-live',
    kind: 'task',
    label: '#1',
    state: 'active',
    displayId: '#1',
    sublabel: 'Live log task',
    taskStatus: 'in_progress',
    reviewState: 'none',
    hasLiveTaskLogs: hasLiveTaskLogs ? true : undefined,
    domainRef: { kind: 'task', teamName: 'demo', taskId: 'task-live' },
    x: 120,
    y: 80,
  };
}

describe('drawTasks', () => {
  it('draws the live log indicator only for task nodes with live log activity', () => {
    const active = createMockContext();
    drawTasks(active.ctx, [createTaskNode(true)], 1, null, null, null, 1);

    const inactive = createMockContext();
    drawTasks(inactive.ctx, [createTaskNode(false)], 1, null, null, null, 1);

    expect(active.arcCalls.length).toBeGreaterThanOrEqual(3);
    expect(inactive.arcCalls).toHaveLength(0);
  });
});
