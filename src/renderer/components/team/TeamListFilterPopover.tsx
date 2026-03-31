/* eslint-disable react-refresh/only-export-components -- TeamListFilterState and EMPTY_TEAM_FILTER shared with TeamListView */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip';
import { getBaseName } from '@renderer/utils/pathUtils';
import { Filter } from 'lucide-react';

import type { TeamSummary } from '@shared/types';

export interface TeamListFilterState {
  selectedProjects: Set<string>;
  selectedStatuses: Set<string>;
}

export const EMPTY_TEAM_FILTER: TeamListFilterState = {
  selectedProjects: new Set(),
  selectedStatuses: new Set(),
};

function folderName(fullPath: string): string {
  return getBaseName(fullPath) || fullPath;
}

interface TeamListFilterPopoverProps {
  filter: TeamListFilterState;
  teams: TeamSummary[];
  aliveTeams: string[];
  onFilterChange: (filter: TeamListFilterState) => void;
}

export const TeamListFilterPopover = ({
  filter,
  teams,
  aliveTeams,
  onFilterChange,
}: TeamListFilterPopoverProps): React.JSX.Element => {
  const { t } = useTranslation();
  const activeCount = useMemo(() => {
    let count = 0;
    if (filter.selectedStatuses.size > 0) count += 1;
    if (filter.selectedProjects.size > 0) count += 1;
    return count;
  }, [filter.selectedStatuses, filter.selectedProjects]);

  const uniqueProjects = useMemo(() => {
    const paths = new Set<string>();
    for (const team of teams) {
      if (team.projectPath?.trim()) paths.add(team.projectPath.trim());
    }
    return [...paths].sort((a, b) => folderName(a).localeCompare(folderName(b)));
  }, [teams]);

  const handleStatusToggle = (status: string): void => {
    const next = new Set(filter.selectedStatuses);
    if (next.has(status)) {
      next.delete(status);
    } else {
      next.add(status);
    }
    onFilterChange({ ...filter, selectedStatuses: next });
  };

  const handleProjectToggle = (project: string): void => {
    const next = new Set(filter.selectedProjects);
    if (next.has(project)) {
      next.delete(project);
    } else {
      next.add(project);
    }
    onFilterChange({ ...filter, selectedProjects: next });
  };

  const handleClearAll = (): void => {
    onFilterChange(EMPTY_TEAM_FILTER);
  };

  const aliveSet = useMemo(() => new Set(aliveTeams), [aliveTeams]);
  const runningCount = useMemo(
    () => teams.filter((t) => aliveSet.has(t.teamName)).length,
    [teams, aliveSet]
  );
  const offlineCount = useMemo(
    () => teams.filter((t) => !aliveSet.has(t.teamName)).length,
    [teams, aliveSet]
  );

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="relative h-8 px-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              aria-label={t('team.listFilter.filterTeams')}
            >
              <Filter size={14} />
              {activeCount > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-medium text-white">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('team.listFilter.filterTeams')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-0">
        {/* Status section */}
        <div className="border-b border-[var(--color-border)] p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            {t('team.listFilter.status')}
          </p>
          <div className="space-y-1.5">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- Radix Checkbox renders a button, not a native input */}
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]">
              <Checkbox
                checked={filter.selectedStatuses.has('running')}
                onCheckedChange={() => handleStatusToggle('running')}
              />
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {t('team.listFilter.running')}
                <span className="text-[var(--color-text-muted)]">({runningCount})</span>
              </span>
            </label>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- Radix Checkbox renders a button, not a native input */}
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]">
              <Checkbox
                checked={filter.selectedStatuses.has('offline')}
                onCheckedChange={() => handleStatusToggle('offline')}
              />
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-zinc-500" />
                {t('team.listFilter.offline')}
                <span className="text-[var(--color-text-muted)]">({offlineCount})</span>
              </span>
            </label>
          </div>
        </div>

        {/* Project section */}
        {uniqueProjects.length > 0 && (
          <div className="border-b border-[var(--color-border)] p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              {t('team.listFilter.project')}
            </p>
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {uniqueProjects.map((project) => (
                <label
                  key={project}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
                  title={project}
                >
                  <Checkbox
                    checked={filter.selectedProjects.has(project)}
                    onCheckedChange={() => handleProjectToggle(project)}
                  />
                  <span className="truncate">{folderName(project)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            disabled={activeCount === 0}
            onClick={handleClearAll}
          >
            {t('team.listFilter.clearAll')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
/* eslint-enable react-refresh/only-export-components -- pair for file-level disable */
