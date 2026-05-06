import type { InboxMessage } from '@shared/types';

type AutomationMessageLike = Pick<InboxMessage, 'from' | 'messageId' | 'messageKind' | 'source'>;

export function isTaskStallRemediationMessage(message: AutomationMessageLike): boolean {
  if (message.messageKind === 'task_stall_remediation') {
    return true;
  }

  const messageId = typeof message.messageId === 'string' ? message.messageId.trim() : '';
  return (
    message.source === 'system_notification' &&
    message.from === 'system' &&
    messageId.startsWith('task-stall:')
  );
}
