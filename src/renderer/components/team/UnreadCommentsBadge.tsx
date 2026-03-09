import { MessageSquare } from 'lucide-react';

interface UnreadCommentsBadgeProps {
  unreadCount: number;
  totalCount: number;
}

export const UnreadCommentsBadge = ({
  unreadCount,
  totalCount,
}: UnreadCommentsBadgeProps): React.JSX.Element | null => {
  if (totalCount === 0) return null;

  return (
    <span className="relative inline-flex items-center gap-0.5 rounded-full bg-[var(--color-surface-raised)] px-1.5 py-0 text-[10px] font-medium text-[var(--color-text-muted)]">
      <MessageSquare size={10} />
      {totalCount}
      {unreadCount > 0 && (
        <span className="absolute -right-2.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold leading-none text-white">
          {unreadCount}
        </span>
      )}
    </span>
  );
};
