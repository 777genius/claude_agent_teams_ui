import { useMemo } from 'react';

import { useStore } from '@renderer/store';
import { ExternalLink } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { TaskDetailDialog } from './TaskDetailDialog';

import type { TeamTaskWithKanban } from '@shared/types';

/**
 * Global wrapper around TaskDetailDialog.
 * Mounted at layout level so it can be opened from anywhere (e.g. sidebar)
 * without navigating to the team page first.
 */
export const GlobalTaskDetailDialog = (): React.JSX.Element | null => {
  const {
    globalTaskDetail,
    closeGlobalTaskDetail,
    selectedTeamData,
    selectedTeamLoading,
    openTeamTab,
  } = useStore(
    useShallow((s) => ({
      globalTaskDetail: s.globalTaskDetail,
      closeGlobalTaskDetail: s.closeGlobalTaskDetail,
      selectedTeamData: s.selectedTeamData,
      selectedTeamLoading: s.selectedTeamLoading,
      openTeamTab: s.openTeamTab,
    }))
  );

  const taskMap = useMemo(() => {
    const map = new Map<string, TeamTaskWithKanban>();
    if (!selectedTeamData) return map;
    for (const t of selectedTeamData.tasks) map.set(t.id, t);
    return map;
  }, [selectedTeamData]);

  const activeMembers = useMemo(
    () => selectedTeamData?.members.filter((m) => !m.removedAt) ?? [],
    [selectedTeamData]
  );

  if (!globalTaskDetail) return null;

  const { teamName, taskId } = globalTaskDetail;
  const task = taskMap.get(taskId) ?? null;
  const kanbanTaskState = selectedTeamData?.kanbanState.tasks[taskId];

  const handleOpenTeam = (): void => {
    closeGlobalTaskDetail();
    openTeamTab(teamName, undefined, taskId);
  };

  return (
    <TaskDetailDialog
      open
      task={selectedTeamLoading ? null : task}
      teamName={teamName}
      kanbanTaskState={kanbanTaskState}
      taskMap={taskMap}
      members={activeMembers}
      onClose={closeGlobalTaskDetail}
      onOwnerChange={undefined}
      headerExtra={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)]"
          onClick={handleOpenTeam}
        >
          <ExternalLink size={12} />
          Open team
        </button>
      }
    />
  );
};
