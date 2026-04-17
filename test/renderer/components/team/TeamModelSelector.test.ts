import { describe, expect, it } from 'vitest';

import {
  computeEffectiveTeamModel,
  formatTeamModelSummary,
} from '@renderer/components/team/dialogs/TeamModelSelector';
import {
  GPT_5_1_CODEX_MINI_UI_DISABLED_REASON,
  GPT_5_1_CODEX_MAX_CHATGPT_UI_DISABLED_REASON,
  GPT_5_2_CODEX_UI_DISABLED_REASON,
  GPT_5_3_CODEX_SPARK_UI_DISABLED_REASON,
  getAvailableTeamProviderModels,
  getTeamModelSelectionError,
  getTeamModelUiDisabledReason,
  normalizeTeamModelForUi,
} from '@renderer/utils/teamModelAvailability';

describe('formatTeamModelSummary', () => {
  it('shows cross-provider Anthropic models as backend-routed instead of brand-mismatched', () => {
    expect(formatTeamModelSummary('codex', 'claude-opus-4-6', 'medium')).toBe(
      'Opus 4.6 · via Codex · Medium'
    );
  });

  it('keeps native Codex-family models branded normally', () => {
    expect(formatTeamModelSummary('codex', 'gpt-5.4', 'medium')).toBe('5.4 · Medium');
  });

  it('marks the known disabled Codex models only for Codex team selection', () => {
    expect(getTeamModelUiDisabledReason('codex', 'gpt-5.1-codex-mini')).toBe(
      GPT_5_1_CODEX_MINI_UI_DISABLED_REASON
    );
    expect(getTeamModelUiDisabledReason('codex', 'gpt-5.2-codex')).toBe(
      GPT_5_2_CODEX_UI_DISABLED_REASON
    );
    expect(getTeamModelUiDisabledReason('codex', 'gpt-5.3-codex-spark')).toBe(
      GPT_5_3_CODEX_SPARK_UI_DISABLED_REASON
    );
    expect(getTeamModelUiDisabledReason('codex', 'gpt-5.4-mini')).toBeNull();
    expect(getTeamModelUiDisabledReason('anthropic', 'gpt-5.1-codex-mini')).toBeNull();
  });

  it('disables 5.1 Codex Max only on the Codex ChatGPT subscription path', () => {
    const chatgptCodexProviderStatus = {
      providerId: 'codex' as const,
      models: ['gpt-5.4', 'gpt-5.1-codex-max'],
      authMethod: 'oauth_token' as const,
      backend: {
        kind: 'adapter',
        label: 'Default adapter',
        endpointLabel: 'chatgpt.com/backend-api/codex/responses',
      },
      modelVerificationState: 'verified' as const,
      modelAvailability: [],
      authenticated: true,
      supported: true,
    };

    expect(
      getTeamModelUiDisabledReason('codex', 'gpt-5.1-codex-max', chatgptCodexProviderStatus)
    ).toBe(GPT_5_1_CODEX_MAX_CHATGPT_UI_DISABLED_REASON);
    expect(normalizeTeamModelForUi('codex', 'gpt-5.1-codex-max', chatgptCodexProviderStatus)).toBe(
      ''
    );
    expect(
      getTeamModelSelectionError('codex', 'gpt-5.1-codex-max', chatgptCodexProviderStatus)
    ).toContain('Temporarily disabled for team agents when using Codex ChatGPT subscription');
    expect(getTeamModelUiDisabledReason('codex', 'gpt-5.1-codex-max')).toBeNull();
  });

  it('normalizes disabled Codex model selections back to default', () => {
    expect(normalizeTeamModelForUi('codex', 'gpt-5.1-codex-mini')).toBe('');
    expect(normalizeTeamModelForUi('codex', 'gpt-5.2-codex')).toBe('');
    expect(normalizeTeamModelForUi('codex', 'gpt-5.3-codex-spark')).toBe('');
    expect(normalizeTeamModelForUi('codex', 'gpt-5.4-mini')).toBe('');
  });

  it('uses the runtime-reported Codex model list when provider status is available', () => {
    const codexProviderStatus = {
      providerId: 'codex' as const,
      models: ['gpt-5.4', 'gpt-5.3-codex'],
      authMethod: 'oauth_token' as const,
      backend: {
        kind: 'adapter',
        label: 'Default adapter',
        endpointLabel: 'chatgpt.com/backend-api/codex/responses',
      },
      modelVerificationState: 'verified' as const,
      modelAvailability: [
        { modelId: 'gpt-5.4', status: 'available' as const, checkedAt: null },
        { modelId: 'gpt-5.3-codex', status: 'available' as const, checkedAt: null },
      ],
      authenticated: true,
      supported: true,
    };

    expect(getAvailableTeamProviderModels('codex', codexProviderStatus)).toEqual([
      'gpt-5.4',
      'gpt-5.3-codex',
    ]);
    expect(normalizeTeamModelForUi('codex', 'gpt-5.2-codex', codexProviderStatus)).toBe('');
    expect(normalizeTeamModelForUi('codex', 'gpt-5.4', codexProviderStatus)).toBe('gpt-5.4');
  });

  it('waits for the runtime model list before validating explicit Codex selections', () => {
    expect(getTeamModelSelectionError('codex', 'gpt-5.4')).toContain('waiting for Codex runtime verification');
    expect(getTeamModelSelectionError('codex', '')).toBeNull();
    expect(getTeamModelSelectionError('anthropic', 'opus')).toBeNull();
  });
});

describe('computeEffectiveTeamModel', () => {
  it('appends [1m] for anthropic models', () => {
    expect(computeEffectiveTeamModel('opus', false, 'anthropic')).toBe('opus[1m]');
    expect(computeEffectiveTeamModel('sonnet', false, 'anthropic')).toBe('sonnet[1m]');
  });

  it('does not double-append [1m] when input already has it', () => {
    expect(computeEffectiveTeamModel('opus[1m]', false, 'anthropic')).toBe('opus[1m]');
    expect(computeEffectiveTeamModel('sonnet[1m]', false, 'anthropic')).toBe('sonnet[1m]');
    expect(computeEffectiveTeamModel('opus[1m][1m]', false, 'anthropic')).toBe('opus[1m]');
  });

  it('defaults to opus[1m] when no model selected', () => {
    expect(computeEffectiveTeamModel('', false, 'anthropic')).toBe('opus[1m]');
  });

  it('returns base model without [1m] when limitContext is true', () => {
    expect(computeEffectiveTeamModel('opus', true, 'anthropic')).toBe('opus');
    expect(computeEffectiveTeamModel('opus[1m]', true, 'anthropic')).toBe('opus');
    expect(computeEffectiveTeamModel('opus[1m][1m]', true, 'anthropic')).toBe('opus');
    expect(computeEffectiveTeamModel('', true, 'anthropic')).toBe('opus');
  });

  it('returns haiku as-is', () => {
    expect(computeEffectiveTeamModel('haiku', false, 'anthropic')).toBe('haiku');
  });

  it('returns non-anthropic models as-is', () => {
    expect(computeEffectiveTeamModel('gpt-5.4', false, 'codex')).toBe('gpt-5.4');
    expect(computeEffectiveTeamModel('custom-model[1m]', false, 'codex')).toBe('custom-model[1m]');
  });
});
