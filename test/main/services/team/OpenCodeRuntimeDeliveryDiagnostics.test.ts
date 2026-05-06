import { describe, expect, it } from 'vitest';

import { selectOpenCodeRuntimeDeliveryReason } from '../../../../src/main/services/team/opencode/delivery/OpenCodeRuntimeDeliveryDiagnostics';

import type { OpenCodePromptDeliveryLedgerRecord } from '../../../../src/main/services/team/opencode/delivery/OpenCodePromptDeliveryLedger';

function record(
  input: Partial<OpenCodePromptDeliveryLedgerRecord>
): OpenCodePromptDeliveryLedgerRecord {
  return {
    id: 'opencode-prompt:test',
    teamName: 'forge-labs',
    memberName: 'bob',
    laneId: 'secondary:opencode:bob',
    runId: 'run-1',
    runtimeSessionId: 'ses-1',
    inboxMessageId: 'msg-1',
    inboxTimestamp: '2026-05-06T18:31:36.478Z',
    source: 'watcher',
    messageKind: null,
    replyRecipient: 'team-lead',
    actionMode: null,
    taskRefs: [],
    payloadHash: 'sha256:test',
    status: 'failed_terminal',
    responseState: 'not_observed',
    attempts: 3,
    maxAttempts: 3,
    acceptanceUnknown: false,
    nextAttemptAt: null,
    lastAttemptAt: null,
    lastObservedAt: null,
    acceptedAt: null,
    respondedAt: null,
    failedAt: '2026-05-06T18:33:42.896Z',
    inboxReadCommittedAt: null,
    inboxReadCommitError: null,
    prePromptCursor: null,
    postPromptCursor: null,
    deliveredUserMessageId: null,
    observedAssistantMessageId: null,
    observedAssistantPreview: null,
    observedToolCallNames: [],
    observedVisibleMessageId: null,
    visibleReplyMessageId: null,
    visibleReplyInbox: null,
    visibleReplyCorrelation: null,
    lastReason: null,
    diagnostics: [],
    createdAt: '2026-05-06T18:31:36.636Z',
    updatedAt: '2026-05-06T18:33:42.896Z',
    ...input,
  };
}

describe('OpenCodeRuntimeDeliveryDiagnostics', () => {
  it('skips internal bootstrap MCP diagnostics when a provider error is available', () => {
    const reason = selectOpenCodeRuntimeDeliveryReason(
      record({
        responseState: 'empty_assistant_turn',
        lastReason: 'empty_assistant_turn',
        diagnostics: [
          'OpenCode app MCP was reattached before message delivery.',
          'OpenCode bootstrap MCP did not complete required tools before assistant response: runtime_bootstrap_checkin, member_briefing',
          'Latest assistant message msg_1 failed with APIError - Insufficient credits. Add more credits.',
          'empty_assistant_turn',
        ],
      })
    );

    expect(reason).toBe('Insufficient credits. Add more credits.');
  });

  it('falls back to empty assistant turn when diagnostics are only internal noise', () => {
    const reason = selectOpenCodeRuntimeDeliveryReason(
      record({
        responseState: 'empty_assistant_turn',
        lastReason: 'empty_assistant_turn',
        diagnostics: [
          'OpenCode bridge command timed out',
          'OpenCode bootstrap MCP did not complete required tools before assistant response: runtime_bootstrap_checkin, member_briefing',
          'empty_assistant_turn',
        ],
      })
    );

    expect(reason).toBe('OpenCode returned an empty assistant turn.');
  });

  it('maps missing visible reply proof to a readable protocol error', () => {
    const reason = selectOpenCodeRuntimeDeliveryReason(
      record({
        responseState: 'responded_non_visible_tool',
        lastReason: 'visible_reply_still_required',
        diagnostics: [
          'OpenCode bootstrap MCP did not complete required tools before assistant response: runtime_bootstrap_checkin, member_briefing',
          'visible_reply_still_required',
        ],
      })
    );

    expect(reason).toBe('OpenCode responded, but did not create a visible message_send reply.');
  });

  it('never exposes only internal generic bootstrap diagnostics as the user-facing reason', () => {
    const reason = selectOpenCodeRuntimeDeliveryReason(
      record({
        diagnostics: [
          'OpenCode app MCP was reattached before message delivery.',
          'OpenCode bootstrap MCP did not complete required tools before assistant response: runtime_bootstrap_checkin, member_briefing',
        ],
      })
    );

    expect(reason).toBe('OpenCode runtime delivery did not complete.');
  });
});
