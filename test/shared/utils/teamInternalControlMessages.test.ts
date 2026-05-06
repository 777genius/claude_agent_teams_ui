import { describe, expect, it } from 'vitest';

import {
  isLeadInboxRelayControlPromptText,
  isTeamInternalControlMessageText,
  isTeammateProtocolControlText,
} from '@shared/utils/teamInternalControlMessages';

const leadRelayPrompt = `You have new inbox messages addressed to you (team lead "team-lead").
Process them in order (oldest first).
If action is required, delegate via task creation or SendMessage, and keep responses minimal.
IMPORTANT: Your text response here is shown to the user.

Messages:
1) From: tom
   Timestamp: 2026-05-06T15:02:54.853Z
   Text:
   #f8d7235a done.`;

describe('teamInternalControlMessages', () => {
  it('detects lead inbox relay prompts and Human-prefixed echoes', () => {
    expect(isLeadInboxRelayControlPromptText(leadRelayPrompt)).toBe(true);
    expect(isLeadInboxRelayControlPromptText(`Human: ${leadRelayPrompt}`)).toBe(true);
    expect(isTeamInternalControlMessageText(`Human: ${leadRelayPrompt}`)).toBe(true);
  });

  it('does not hide ordinary visible lead replies', () => {
    expect(
      isLeadInboxRelayControlPromptText(
        'I delegated #f8d7235a to tom and asked alice to review when blockers clear.'
      )
    ).toBe(false);
  });

  it('detects Human-prefixed teammate protocol blocks', () => {
    const text =
      'Human: <teammate-message teammate_id="alice">\n{"type":"idle_notification"}\n</teammate-message>';

    expect(isTeammateProtocolControlText(text)).toBe(true);
    expect(isTeamInternalControlMessageText(text)).toBe(true);
  });
});
