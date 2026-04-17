import { describe, expect, it } from 'vitest';

import { getProvisioningModelIssue } from '@renderer/components/team/dialogs/provisioningModelIssues';

describe('getProvisioningModelIssue', () => {
  it('extracts a formatted Codex model failure with clean reason', () => {
    expect(
      getProvisioningModelIssue(
        [
          {
            providerId: 'codex',
            status: 'failed',
            details: [
              '5.4 Mini - verified',
              '5.1 Codex Max - unavailable - Not available with Codex ChatGPT subscription',
            ],
          },
        ],
        'codex',
        'gpt-5.1-codex-max'
      )
    ).toEqual({
      providerId: 'codex',
      modelId: 'gpt-5.1-codex-max',
      kind: 'unavailable',
      reason: 'Not available with Codex ChatGPT subscription',
      detail: '5.1 Codex Max - unavailable - Not available with Codex ChatGPT subscription',
    });
  });

  it('returns null for verified models without their own failure line', () => {
    expect(
      getProvisioningModelIssue(
        [
          {
            providerId: 'codex',
            status: 'failed',
            details: [
              '5.4 Mini - verified',
              '5.1 Codex Max - unavailable - Not available with Codex ChatGPT subscription',
            ],
          },
        ],
        'codex',
        'gpt-5.4-mini'
      )
    ).toBeNull();
  });
});
