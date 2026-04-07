import { describe, expect, it } from 'vitest';

import { formatTeamModelSummary } from '@renderer/components/team/dialogs/TeamModelSelector';

describe('formatTeamModelSummary', () => {
  it('shows cross-provider Anthropic models as backend-routed instead of brand-mismatched', () => {
    expect(formatTeamModelSummary('codex', 'claude-opus-4-6', 'medium')).toBe(
      'Opus 4.6 · via Codex · Medium'
    );
  });

  it('keeps native Codex-family models branded normally', () => {
    expect(formatTeamModelSummary('codex', 'gpt-5.4', 'medium')).toBe('GPT-5.4 · Medium');
  });
});
