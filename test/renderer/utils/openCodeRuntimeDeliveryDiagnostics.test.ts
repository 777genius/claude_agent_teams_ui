import { describe, expect, it } from 'vitest';

import { buildOpenCodeRuntimeDeliveryDiagnostics } from '../../../src/renderer/utils/openCodeRuntimeDeliveryDiagnostics';

describe('openCodeRuntimeDeliveryDiagnostics', () => {
  it('surfaces terminal empty assistant turn in the compact failed warning', () => {
    const diagnostics = buildOpenCodeRuntimeDeliveryDiagnostics({
      deliveredToInbox: true,
      messageId: 'msg-empty',
      runtimeDelivery: {
        providerId: 'opencode',
        attempted: true,
        delivered: false,
        responsePending: false,
        responseState: 'empty_assistant_turn',
        ledgerStatus: 'failed_terminal',
        reason: 'empty_assistant_turn',
        diagnostics: ['empty_assistant_turn'],
      },
    });

    expect(diagnostics.warning).toBe(
      'OpenCode runtime delivery failed. Message was saved to inbox, but live delivery did not complete. Reason: OpenCode returned an empty assistant turn.'
    );
    expect(diagnostics.debugDetails).toMatchObject({
      responseState: 'empty_assistant_turn',
      reason: 'empty_assistant_turn',
    });
  });

  it('surfaces prompt delivery with no recorded assistant turn separately', () => {
    const diagnostics = buildOpenCodeRuntimeDeliveryDiagnostics({
      deliveredToInbox: true,
      messageId: 'msg-no-assistant',
      runtimeDelivery: {
        providerId: 'opencode',
        attempted: true,
        delivered: false,
        responsePending: false,
        responseState: 'prompt_delivered_no_assistant_message',
        ledgerStatus: 'failed_terminal',
        reason: 'prompt_delivered_no_assistant_message',
        diagnostics: ['prompt_delivered_no_assistant_message'],
      },
    });

    expect(diagnostics.warning).toBe(
      'OpenCode runtime delivery failed. Message was saved to inbox, but live delivery did not complete. Reason: OpenCode accepted the prompt, but no assistant turn was recorded.'
    );
    expect(diagnostics.debugDetails).toMatchObject({
      responseState: 'prompt_delivered_no_assistant_message',
      reason: 'prompt_delivered_no_assistant_message',
    });
  });
});
