/**
 * KanbanLayoutEngine — positions task nodes in kanban columns relative to their owner.
 *
 * Each member/lead gets a zone below them with 4 columns: todo → wip → review → done.
 * Tasks are pinned (fx/fy) — no d3-force drift. Deterministic layout.
 *
 * Class with ES #private methods, single source of truth from KANBAN_ZONE constants.
 */

import type { GraphNode } from '../ports/types';
import { KANBAN_ZONE } from '../constants/canvas-constants';

export class KanbanLayoutEngine {
  /**
   * Position all task nodes in kanban columns relative to their owner.
   * Call AFTER d3-force settles member positions, BEFORE drawing.
   */
  static layout(nodes: GraphNode[]): void {
    const nodeMap = new Map<string, GraphNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    // Group tasks by owner
    const tasksByOwner = new Map<string, GraphNode[]>();
    const unassigned: GraphNode[] = [];

    for (const n of nodes) {
      if (n.kind !== 'task') continue;
      if (n.ownerId) {
        let group = tasksByOwner.get(n.ownerId);
        if (!group) {
          group = [];
          tasksByOwner.set(n.ownerId, group);
        }
        group.push(n);
      } else {
        unassigned.push(n);
      }
    }

    // Layout each owner's tasks in kanban columns
    for (const [ownerId, tasks] of tasksByOwner) {
      const owner = nodeMap.get(ownerId);
      if (!owner || owner.x == null || owner.y == null) continue;
      KanbanLayoutEngine.#layoutZone(tasks, owner.x, owner.y);
    }

    // Unassigned tasks: separate zone
    KanbanLayoutEngine.#layoutUnassigned(unassigned);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  static #layoutZone(tasks: GraphNode[], ownerX: number, ownerY: number): void {
    const { columnWidth, rowHeight, offsetY, columns, maxVisibleRows } = KANBAN_ZONE;
    const totalWidth = columns.length * columnWidth;
    const baseX = ownerX - totalWidth / 2;
    const baseY = ownerY + offsetY;

    // Classify each task into a column
    const colTasks = new Map<string, GraphNode[]>();
    for (const col of columns) colTasks.set(col, []);

    for (const task of tasks) {
      const col = KanbanLayoutEngine.#resolveColumn(task);
      colTasks.get(col)?.push(task);
    }

    // Position each task in its column + row
    for (const [colIdx, colName] of columns.entries()) {
      const colNodes = colTasks.get(colName) ?? [];
      for (const [rowIdx, task] of colNodes.entries()) {
        if (rowIdx >= maxVisibleRows) {
          // Hide overflow tasks off-screen
          task.x = -99999;
          task.y = -99999;
          task.fx = task.x;
          task.fy = task.y;
          continue;
        }
        task.x = baseX + colIdx * columnWidth;
        task.y = baseY + rowIdx * rowHeight;
        task.fx = task.x;
        task.fy = task.y;
        task.vx = 0;
        task.vy = 0;
      }
    }
  }

  /**
   * Determine which kanban column a task belongs to.
   * Review state takes priority: if reviewState !== 'none', task goes to 'review' column.
   */
  static #resolveColumn(task: GraphNode): string {
    if (task.reviewState && task.reviewState !== 'none') return 'review';
    switch (task.taskStatus) {
      case 'in_progress':
        return 'wip';
      case 'completed':
        return 'done';
      default:
        return 'todo';
    }
  }

  static #layoutUnassigned(tasks: GraphNode[]): void {
    const { columnWidth, rowHeight } = KANBAN_ZONE;
    for (const [idx, task] of tasks.entries()) {
      task.x = -400 + (idx % 3) * columnWidth;
      task.y = 400 + Math.floor(idx / 3) * rowHeight;
      task.fx = task.x;
      task.fy = task.y;
      task.vx = 0;
      task.vy = 0;
    }
  }
}
