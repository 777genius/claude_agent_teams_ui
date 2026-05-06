import { describe, expect, it } from 'vitest';

import {
  isActionRequiredOpenCodeRuntimeDeliveryReason,
  selectOpenCodeRuntimeDeliveryReason,
} from '../../../../src/main/services/team/opencode/delivery/OpenCodeRuntimeDeliveryDiagnostics';

describe('OpenCodeRuntimeDeliveryDiagnostics', () => {
  it('treats OpenRouter key limit errors as action-required delivery failures', () => {
    const reason =
      'Key limit exceeded (total limit). Manage it using https://openrouter.ai/settings/keys';

    expect(isActionRequiredOpenCodeRuntimeDeliveryReason(reason)).toBe(true);
  });

  it('does not treat protocol proof repair reasons as action-required provider failures', () => {
    expect(isActionRequiredOpenCodeRuntimeDeliveryReason('visible_reply_still_required')).toBe(
      false
    );
  });

  it('selects a concrete OpenCode runtime delivery diagnostic before generic fallback text', () => {
    const record = {
      diagnostics: [
        'Latest assistant message for opencode session abc failed with APIError - Key limit exceeded (total limit). Manage it using https://openrouter.ai/settings/keys',
      ],
      lastReason: 'OpenCode runtime delivery failed',
      responseState: 'session_error',
      status: 'accepted',
    } as Parameters<typeof selectOpenCodeRuntimeDeliveryReason>[0];

    expect(selectOpenCodeRuntimeDeliveryReason(record)).toContain('Key limit exceeded');
  });

  it('formats non-visible tool progress failures without exposing the internal reason code', () => {
    const record = {
      diagnostics: ['non_visible_tool_without_task_progress'],
      lastReason: 'non_visible_tool_without_task_progress',
      responseState: 'responded_non_visible_tool',
      status: 'failed_terminal',
    } as Parameters<typeof selectOpenCodeRuntimeDeliveryReason>[0];

    expect(selectOpenCodeRuntimeDeliveryReason(record)).toBe(
      'OpenCode used tools, but did not create a visible reply or task progress proof.'
    );
  });
});
