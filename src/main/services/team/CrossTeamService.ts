import { CROSS_TEAM_SENT_SOURCE, CROSS_TEAM_SOURCE, formatCrossTeamText } from '@shared/constants';
import { getTeamsBasePath } from '@main/utils/pathDecoder';
import { createLogger } from '@shared/utils/logger';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

import { CascadeGuard } from './CascadeGuard';
import { CrossTeamOutbox } from './CrossTeamOutbox';

import type { TeamConfigReader } from './TeamConfigReader';
import type { TeamDataService } from './TeamDataService';
import type { TeamInboxWriter } from './TeamInboxWriter';
import type { TeamProvisioningService } from './TeamProvisioningService';
import type {
  CrossTeamMessage,
  CrossTeamSendRequest,
  CrossTeamSendResult,
  TeamConfig,
} from '@shared/types';

const logger = createLogger('CrossTeamService');

const TEAM_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;

export interface CrossTeamTarget {
  teamName: string;
  displayName: string;
  description?: string;
  color?: string;
}

export class CrossTeamService {
  private cascadeGuard = new CascadeGuard();
  private outbox = new CrossTeamOutbox();

  constructor(
    private configReader: TeamConfigReader,
    private dataService: TeamDataService,
    private inboxWriter: TeamInboxWriter,
    private provisioning: TeamProvisioningService | null
  ) {}

  async send(request: CrossTeamSendRequest): Promise<CrossTeamSendResult> {
    const { fromTeam, fromMember, toTeam, text, summary } = request;
    const chainDepth = request.chainDepth ?? 0;
    const inferredReplyMeta =
      !request.conversationId && !request.replyToConversationId
        ? (this.provisioning?.resolveCrossTeamReplyMetadata(fromTeam, toTeam) ?? null)
        : null;
    const replyToConversationId =
      request.replyToConversationId?.trim() ||
      inferredReplyMeta?.replyToConversationId ||
      undefined;
    const conversationId =
      request.conversationId?.trim() ||
      inferredReplyMeta?.conversationId ||
      replyToConversationId ||
      randomUUID();

    // 1. Validate
    if (!TEAM_NAME_PATTERN.test(fromTeam)) {
      throw new Error(`Invalid fromTeam: ${fromTeam}`);
    }
    if (!TEAM_NAME_PATTERN.test(toTeam)) {
      throw new Error(`Invalid toTeam: ${toTeam}`);
    }
    if (fromTeam === toTeam) {
      throw new Error('Cannot send cross-team message to the same team');
    }
    if (!fromMember || typeof fromMember !== 'string' || fromMember.trim().length === 0) {
      throw new Error('fromMember is required');
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Message text is required');
    }

    const targetConfig = await this.configReader.getConfig(toTeam);
    if (!targetConfig || targetConfig.deletedAt) {
      throw new Error(`Target team not found: ${toTeam}`);
    }

    // 2. Resolve lead
    const leadName = (await this.dataService.getLeadMemberName(toTeam)) ?? 'team-lead';

    // 3. Format
    const from = `${fromTeam}.${fromMember}`;
    const formattedText = formatCrossTeamText(from, chainDepth, text, {
      conversationId,
      replyToConversationId,
    });
    const messageId = randomUUID();
    const outboxMessage: CrossTeamMessage = {
      messageId,
      fromTeam,
      fromMember,
      toTeam,
      conversationId,
      replyToConversationId,
      text,
      summary,
      chainDepth,
      timestamp: new Date().toISOString(),
    };

    const { duplicate } = await this.outbox.appendIfNotRecent(fromTeam, outboxMessage, async () => {
      // 4. Cascade check only for real new deliveries
      this.cascadeGuard.check(fromTeam, toTeam, chainDepth);
      this.cascadeGuard.record(fromTeam, toTeam);

      // 5. Inbox write to TARGET team (TeamInboxWriter handles file lock + in-process lock internally)
      await this.inboxWriter.sendMessage(toTeam, {
        member: leadName,
        text: formattedText,
        from,
        summary: summary ?? `Cross-team message from ${fromTeam}`,
        source: CROSS_TEAM_SOURCE,
        conversationId,
        replyToConversationId,
      });
    });

    if (duplicate) {
      return { messageId: duplicate.messageId, deliveredToInbox: true, deduplicated: true };
    }

    // 6. Write "sent" copy to SENDER's inbox so the message appears in their activity
    const senderLeadName = (await this.dataService.getLeadMemberName(fromTeam)) ?? 'team-lead';
    void this.inboxWriter
      .sendMessage(fromTeam, {
        member: senderLeadName,
        text,
        from: 'user',
        to: `${toTeam}.${leadName}`,
        summary: summary ?? `Cross-team message to ${toTeam}`,
        source: CROSS_TEAM_SENT_SOURCE,
        conversationId,
        replyToConversationId,
      })
      .catch((e: unknown) => {
        logger.warn(
          `Failed to write sender copy for ${fromTeam}: ${e instanceof Error ? e.message : String(e)}`
        );
      });

    // 7. Best-effort relay (if online)
    if (this.provisioning?.isTeamAlive(toTeam)) {
      void this.provisioning.relayLeadInboxMessages(toTeam).catch((e: unknown) => {
        logger.warn(`Cross-team relay to ${toTeam}: ${e instanceof Error ? e.message : String(e)}`);
      });
    }

    return { messageId, deliveredToInbox: true };
  }

  async listAvailableTargets(excludeTeam?: string): Promise<CrossTeamTarget[]> {
    const teamsDir = getTeamsBasePath();
    let entries: string[];
    try {
      entries = await fs.promises.readdir(teamsDir);
    } catch {
      return [];
    }

    const targets: CrossTeamTarget[] = [];
    for (const entry of entries) {
      if (excludeTeam && entry === excludeTeam) continue;
      if (!TEAM_NAME_PATTERN.test(entry)) continue;

      let config: TeamConfig | null;
      try {
        config = await this.configReader.getConfig(entry);
      } catch {
        continue;
      }
      if (!config || config.deletedAt) continue;

      targets.push({
        teamName: entry,
        displayName: config.name || entry,
        description: config.description,
        color: config.color,
      });
    }

    return targets;
  }

  async getOutbox(teamName: string): Promise<CrossTeamMessage[]> {
    return this.outbox.read(teamName);
  }
}
