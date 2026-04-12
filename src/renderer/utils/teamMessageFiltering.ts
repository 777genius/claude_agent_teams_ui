import {
  getSanitizedInboxMessageSummary,
  getSanitizedInboxMessageText,
} from '@renderer/utils/bootstrapPromptSanitizer';
import { shouldKeepIdleMessageInActivityWhenNoiseHidden } from '@renderer/utils/idleNotificationSemantics';
import { isInboxNoiseMessage } from '@shared/utils/inboxNoise';

import type { InboxMessage } from '@shared/types';

export interface TeamMessagesFilter {
  from: Set<string>;
  to: Set<string>;
  showNoise: boolean;
}

export function filterTeamMessages(
  messages: InboxMessage[],
  options: {
    includePassiveIdlePeerSummariesWhenNoiseHidden?: boolean;
    timeWindow?: { start: number; end: number } | null;
    filter: TeamMessagesFilter;
    searchQuery: string;
  }
): InboxMessage[] {
  const {
    includePassiveIdlePeerSummariesWhenNoiseHidden = false,
    timeWindow,
    filter,
    searchQuery,
  } = options;

  let list = messages.filter((m) => m.messageKind !== 'task_comment_notification');
  if (timeWindow) {
    list = list.filter((m) => {
      const ts = new Date(m.timestamp).getTime();
      return ts >= timeWindow.start && ts < timeWindow.end;
    });
  }
  if (!filter.showNoise) {
    list = list.filter((m) => {
      const text = typeof m.text === 'string' ? m.text : '';
      if (!isInboxNoiseMessage(text)) return true;
      return (
        includePassiveIdlePeerSummariesWhenNoiseHidden &&
        shouldKeepIdleMessageInActivityWhenNoiseHidden(text)
      );
    });
  }

  const hasFrom = filter.from.size > 0;
  const hasTo = filter.to.size > 0;
  if (hasFrom && hasTo) {
    list = list.filter((m) => {
      const fromMatch = Boolean(m.from?.trim() && filter.from.has(m.from.trim()));
      const toMatch = Boolean(m.to?.trim() && filter.to.has(m.to.trim()));
      return fromMatch && toMatch;
    });
  } else if (hasFrom || hasTo) {
    list = list.filter((m) => {
      if (hasFrom) return Boolean(m.from?.trim() && filter.from.has(m.from.trim()));
      if (hasTo) return Boolean(m.to?.trim() && filter.to.has(m.to.trim()));
      return true;
    });
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((m) => {
      const text = getSanitizedInboxMessageText(m).toLowerCase();
      const summary = getSanitizedInboxMessageSummary(m).toLowerCase();
      const from = (m.from ?? '').toLowerCase();
      const to = (m.to ?? '').toLowerCase();
      return text.includes(q) || summary.includes(q) || from.includes(q) || to.includes(q);
    });
  }

  const visibleMessageIds = new Set(
    list
      .map((m) => (typeof m.messageId === 'string' ? m.messageId.trim() : ''))
      .filter((id) => id.length > 0)
  );

  return list.filter((m) => {
    const relayOfMessageId =
      typeof m.relayOfMessageId === 'string' ? m.relayOfMessageId.trim() : '';
    if (!relayOfMessageId) {
      return true;
    }
    const ownMessageId = typeof m.messageId === 'string' ? m.messageId.trim() : '';
    if (relayOfMessageId === ownMessageId) {
      return true;
    }
    return !visibleMessageIds.has(relayOfMessageId);
  });
}
