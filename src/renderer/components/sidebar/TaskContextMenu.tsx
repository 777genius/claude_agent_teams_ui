import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/components/ui/context-menu';
import { Archive, ArchiveRestore, Pencil, Pin, PinOff } from 'lucide-react';

import type { GlobalTask } from '@shared/types';

export interface TaskContextMenuProps {
  task: GlobalTask;
  isPinned: boolean;
  isArchived: boolean;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onRename: () => void;
  children: React.ReactNode;
}

export const TaskContextMenu = ({
  task: _task,
  isPinned,
  isArchived,
  onTogglePin,
  onToggleArchive,
  onRename,
  children,
}: TaskContextMenuProps): React.JSX.Element => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="w-full">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onTogglePin}>
          {isPinned ? (
            <>
              <PinOff className="size-3.5 shrink-0" />
              <span>Unpin</span>
            </>
          ) : (
            <>
              <Pin className="size-3.5 shrink-0" />
              <span>Pin</span>
            </>
          )}
        </ContextMenuItem>

        <ContextMenuItem onSelect={onRename}>
          <Pencil className="size-3.5 shrink-0" />
          <span>Rename</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={onToggleArchive}>
          {isArchived ? (
            <>
              <ArchiveRestore className="size-3.5 shrink-0" />
              <span>Unarchive</span>
            </>
          ) : (
            <>
              <Archive className="size-3.5 shrink-0" />
              <span>Archive</span>
            </>
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
