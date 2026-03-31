import { useTranslation } from 'react-i18next';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/components/ui/context-menu';
import { Archive, ArchiveRestore, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';

import type { GlobalTask } from '@shared/types';

export interface TaskContextMenuProps {
  task: GlobalTask;
  isPinned: boolean;
  isArchived: boolean;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onRename: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

export const TaskContextMenu = ({
  task: _task,
  isPinned,
  isArchived,
  onTogglePin,
  onToggleArchive,
  onRename,
  onDelete,
  children,
}: TaskContextMenuProps): React.JSX.Element => {
  const { t } = useTranslation();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="w-full">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <ContextMenuItem onSelect={onTogglePin}>
          {isPinned ? (
            <>
              <PinOff className="size-3.5 shrink-0" />
              <span>{t('sidebar.taskContextMenu.unpin')}</span>
            </>
          ) : (
            <>
              <Pin className="size-3.5 shrink-0" />
              <span>{t('sidebar.taskContextMenu.pin')}</span>
            </>
          )}
        </ContextMenuItem>

        <ContextMenuItem onSelect={onRename}>
          <Pencil className="size-3.5 shrink-0" />
          <span>{t('sidebar.taskContextMenu.rename')}</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={onToggleArchive}>
          {isArchived ? (
            <>
              <ArchiveRestore className="size-3.5 shrink-0" />
              <span>{t('sidebar.taskContextMenu.unarchive')}</span>
            </>
          ) : (
            <>
              <Archive className="size-3.5 shrink-0" />
              <span>{t('sidebar.taskContextMenu.archive')}</span>
            </>
          )}
        </ContextMenuItem>

        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onDelete} className="text-red-400 focus:text-red-400">
              <Trash2 className="size-3.5 shrink-0" />
              <span>{t('sidebar.taskContextMenu.deleteTask')}</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
