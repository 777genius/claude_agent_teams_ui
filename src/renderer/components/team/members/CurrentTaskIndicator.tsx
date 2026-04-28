import { SyncedLoader2 } from '@renderer/components/ui/SyncedLoader2';
import { formatTaskDisplayLabel } from '@shared/utils/taskIdentity';

import type { TeamTaskWithKanban } from '@shared/types';

interface CurrentTaskIndicatorProps {
  task: TeamTaskWithKanban;
  borderColor: string;
  maxSubjectLength?: number;
  activityLabel?: string;
  onOpenTask?: () => void;
}

/**
 * Inline indicator showing a spinning loader + "working on" + task label button.
 * Shared between MemberCard and MemberHoverCard.
 */
export const CurrentTaskIndicator = ({
  task,
  borderColor,
  maxSubjectLength,
  activityLabel = 'working on',
  onOpenTask,
}: CurrentTaskIndicatorProps): React.JSX.Element => {
  const subjectText =
    typeof maxSubjectLength === 'number' &&
    maxSubjectLength > 0 &&
    task.subject.length > maxSubjectLength
      ? `${task.subject.slice(0, maxSubjectLength)}…`
      : task.subject;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <SyncedLoader2 className="size-3 shrink-0" style={{ color: borderColor }} />
      <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{activityLabel}</span>
      <button
        type="button"
        className="min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-[var(--color-text)] transition-opacity hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-[var(--color-border)]"
        title="Open task"
        onClick={(e) => {
          e.stopPropagation();
          onOpenTask?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            e.stopPropagation();
            onOpenTask?.();
          }
        }}
      >
        {formatTaskDisplayLabel(task)} {subjectText}
      </button>
    </div>
  );
};
