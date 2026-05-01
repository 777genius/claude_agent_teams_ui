import { getTeamsBasePath } from '@main/utils/pathDecoder';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { atomicWriteAsync } from './atomicWrite';
import { withFileLock } from './fileLock';
import { withInboxLock } from './inboxLock';

import type { InboxMessage, SendMessageRequest, SendMessageResult } from '@shared/types';

export class TeamInboxWriter {
  async sendMessage(teamName: string, request: SendMessageRequest): Promise<SendMessageResult> {
    const inboxPath = path.join(getTeamsBasePath(), teamName, 'inboxes', `${request.member}.json`);
    const messageId = request.messageId?.trim() || randomUUID();

    const attachmentMeta = request.attachments?.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    }));

    const payload: InboxMessage = {
      from: request.from ?? 'user',
      to: request.to ?? request.member,
      text: request.text,
      timestamp: request.timestamp ?? new Date().toISOString(),
      read: false,
      taskRefs: request.taskRefs?.length ? request.taskRefs : undefined,
      actionMode: request.actionMode,
      commentId: typeof request.commentId === 'string' ? request.commentId : undefined,
      summary: request.summary,
      messageId,
      ...(request.relayOfMessageId && { relayOfMessageId: request.relayOfMessageId }),
      attachments: attachmentMeta?.length ? attachmentMeta : undefined,
      ...(request.source && { source: request.source }),
      ...(request.leadSessionId && { leadSessionId: request.leadSessionId }),
      ...(request.color && { color: request.color }),
      ...(request.conversationId && { conversationId: request.conversationId }),
      ...(request.replyToConversationId && {
        replyToConversationId: request.replyToConversationId,
      }),
      ...(request.toolSummary && { toolSummary: request.toolSummary }),
      ...(request.toolCalls && { toolCalls: request.toolCalls }),
      ...(request.messageKind && { messageKind: request.messageKind }),
      ...(request.slashCommand && { slashCommand: request.slashCommand }),
      ...(request.commandOutput && { commandOutput: request.commandOutput }),
    };
    let resultMessageId = messageId;
    let resultDeduplicated = false;

    await withFileLock(inboxPath, async () => {
      await withInboxLock(inboxPath, async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const list = await this.readInbox(inboxPath);
          const duplicate = this.findRuntimeDeliveryDuplicate(list, payload);
          if (duplicate) {
            resultMessageId = duplicate.messageId ?? messageId;
            resultDeduplicated = true;
            return;
          }
          list.push(payload);
          await atomicWriteAsync(inboxPath, JSON.stringify(list, null, 2));
          const written = await this.readInbox(inboxPath);
          if (written.some((msg) => msg.messageId === messageId)) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
        }
        throw new Error('Failed to verify inbox write');
      });
    });

    return {
      deliveredToInbox: true,
      messageId: resultMessageId,
      ...(resultDeduplicated ? { deduplicated: true } : {}),
    };
  }

  private findRuntimeDeliveryDuplicate(
    messages: readonly InboxMessage[],
    payload: InboxMessage
  ): InboxMessage | null {
    if (
      payload.source !== 'runtime_delivery' ||
      typeof payload.relayOfMessageId !== 'string' ||
      payload.relayOfMessageId.trim().length === 0
    ) {
      return null;
    }

    const relayOfMessageId = payload.relayOfMessageId.trim();
    const from = this.normalizeComparableParticipant(payload.from);
    const to = this.normalizeComparableParticipant(payload.to);
    const text = this.normalizeComparableText(payload.text);
    if (!from || !to || !text) {
      return null;
    }

    return (
      messages.find(
        (candidate) =>
          candidate.source === 'runtime_delivery' &&
          (candidate.relayOfMessageId ?? '').trim() === relayOfMessageId &&
          this.normalizeComparableParticipant(candidate.from) === from &&
          this.normalizeComparableParticipant(candidate.to) === to &&
          this.normalizeComparableText(candidate.text) === text
      ) ?? null
    );
  }

  private normalizeComparableParticipant(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  private normalizeComparableText(value: unknown): string {
    return typeof value === 'string'
      ? value
          .trim()
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+/g, ' ')
      : '';
  }

  private async readInbox(inboxPath: string): Promise<InboxMessage[]> {
    let raw: string;
    try {
      raw = await fs.promises.readFile(inboxPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is InboxMessage => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const row = item as Partial<InboxMessage>;
      return (
        typeof row.from === 'string' &&
        typeof row.text === 'string' &&
        typeof row.timestamp === 'string' &&
        typeof row.read === 'boolean'
      );
    });
  }
}
