import { describe, expect, it } from 'vitest';

import {
  isOpenCodePromptDeliveryObserveLaterResponseState,
  isOpenCodePromptDeliveryRetryableResponseState,
} from '@main/services/team/opencode/delivery/OpenCodePromptDeliveryWatchdog';
import { isOpenCodePromptDeliveryRetryAttemptDue } from '@main/services/team/TeamProvisioningService';

describe('OpenCodePromptDeliveryWatchdog retry policy', () => {
  it('treats stale OpenCode sessions as retryable after observation', () => {
    expect(isOpenCodePromptDeliveryObserveLaterResponseState('session_stale')).toBe(true);
    expect(isOpenCodePromptDeliveryRetryableResponseState('session_stale')).toBe(true);
  });

  it('does not retry prompt indexing states before OpenCode has had a chance to answer', () => {
    expect(isOpenCodePromptDeliveryObserveLaterResponseState('prompt_not_indexed')).toBe(true);
    expect(isOpenCodePromptDeliveryRetryableResponseState('prompt_not_indexed')).toBe(false);
  });

  it('lets due accepted stale-session records proceed to a fresh send attempt', () => {
    expect(
      isOpenCodePromptDeliveryRetryAttemptDue({
        attemptDue: true,
        ledgerRecord: {
          status: 'accepted',
          responseState: 'session_stale',
        },
      })
    ).toBe(true);
  });

  it('keeps non-due stale-session records in observation mode', () => {
    expect(
      isOpenCodePromptDeliveryRetryAttemptDue({
        attemptDue: false,
        ledgerRecord: {
          status: 'accepted',
          responseState: 'session_stale',
        },
      })
    ).toBe(false);
  });
});
