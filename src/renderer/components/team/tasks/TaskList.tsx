import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TaskRow } from './TaskRow';

import type { TeamTaskWithKanban } from '@shared/types';

interface TaskListProps {
  tasks: TeamTaskWithKanban[];
}

export const TaskList = ({ tasks }: TaskListProps): React.JSX.Element => {
  const { t } = useTranslation();
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const ownerOptions = useMemo(() => {
    return Array.from(
      new Set(tasks.map((task) => task.owner).filter((owner): owner is string => !!owner))
    );
  }, [tasks]);
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const ownerOk = ownerFilter === 'all' || task.owner === ownerFilter;
      const statusOk = statusFilter === 'all' || task.status === statusFilter;
      return ownerOk && statusOk;
    });
  }, [tasks, ownerFilter, statusFilter]);

  const showStatusFilter = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
    }
    return Array.from(counts.values()).some((count) => count > 10);
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-text-muted)]">
        {t('tasks.list.noTasks')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] p-2">
        <select
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
          value={ownerFilter}
          aria-label={t('tasks.list.filterByOwner')}
          onChange={(event) => setOwnerFilter(event.target.value)}
        >
          <option value="all">{t('tasks.list.allOwners')}</option>
          {ownerOptions.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
        {showStatusFilter ? (
          <select
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
            value={statusFilter}
            aria-label={t('tasks.list.filterByStatus')}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">{t('tasks.list.allStatuses')}</option>
            <option value="pending">pending</option>
            <option value="in_progress">in_progress</option>
            <option value="completed">completed</option>
            <option value="deleted">deleted</option>
          </select>
        ) : null}
        {ownerFilter !== 'all' || statusFilter !== 'all' ? (
          <p className="self-center text-[11px] text-[var(--color-text-muted)]">
            {t('tasks.list.showing', { filtered: filteredTasks.length, total: tasks.length })}
          </p>
        ) : null}
      </div>
      <table className="min-w-full table-fixed">
        <thead className="bg-[var(--color-surface-raised)]">
          <tr>
            <th className="w-16 px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              {t('tasks.list.id')}
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              {t('tasks.list.subject')}
            </th>
            <th className="w-40 px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              {t('tasks.list.owner')}
            </th>
            <th className="w-32 px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              {t('tasks.list.status')}
            </th>
            <th className="w-28 px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              {t('tasks.list.blockedBy')}
            </th>
            <th className="w-28 px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              {t('tasks.list.blocks')}
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </tbody>
      </table>
    </div>
  );
};
