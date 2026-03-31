import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
/**
 * Empty state for ChatHistory when no conversation exists.
 */
export const ChatHistoryEmptyState = (): JSX.Element => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center overflow-hidden bg-surface">
      <div className="space-y-2 text-center text-text-muted">
        <div className="mb-4 text-6xl">💬</div>
        <div className="text-xl font-medium text-text-secondary">
          {t('chat.emptyState.noConversationHistory')}
        </div>
        <div className="text-sm">{t('chat.emptyState.noMessagesYet')}</div>
      </div>
    </div>
  );
};
