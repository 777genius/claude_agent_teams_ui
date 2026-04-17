import { describe, expect, it } from 'vitest';

import {
  getAvailableTeamProviderModelOptions,
  getAvailableTeamProviderModels,
  getTeamModelSelectionError,
  normalizeTeamModelForUi,
  type TeamModelRuntimeProviderStatus,
} from '@renderer/utils/teamModelAvailability';

function createCodexProviderStatus(
  models: string[],
  overrides: Partial<TeamModelRuntimeProviderStatus> = {}
): TeamModelRuntimeProviderStatus {
  return {
    providerId: 'codex',
    models,
    authMethod: 'oauth_token',
    backend: {
      kind: 'adapter',
      label: 'Default adapter',
      endpointLabel: 'chatgpt.com/backend-api/codex/responses',
    },
    authenticated: true,
    supported: true,
    modelVerificationState: 'idle',
    modelAvailability: [],
    ...overrides,
  };
}

describe('teamModelAvailability', () => {
  it('uses runtime-reported Codex models as the source of truth', () => {
    const providerStatus = createCodexProviderStatus(['gpt-5.4', 'gpt-5.3-codex']);

    expect(getAvailableTeamProviderModels('codex', providerStatus)).toEqual([
      'gpt-5.4',
      'gpt-5.3-codex',
    ]);
  });

  it('filters Codex models that are UI-disabled even if runtime reports them', () => {
    const providerStatus = createCodexProviderStatus([
      'gpt-5.4',
      'gpt-5.3-codex-spark',
      'gpt-5.2-codex',
      'gpt-5.1-codex-mini',
      'gpt-5.1-codex-max',
    ]);

    expect(getAvailableTeamProviderModels('codex', providerStatus)).toEqual(['gpt-5.4']);
  });

  it('keeps 5.1 Codex Max available outside the ChatGPT subscription path', () => {
    const providerStatus = createCodexProviderStatus(['gpt-5.4', 'gpt-5.1-codex-max'], {
      authMethod: 'api_key',
      backend: {
        kind: 'openai',
        label: 'OpenAI',
        endpointLabel: 'api.openai.com/v1/responses',
      },
    });

    expect(getAvailableTeamProviderModels('codex', providerStatus)).toEqual([
      'gpt-5.4',
      'gpt-5.1-codex-max',
    ]);
  });

  it('builds Codex model options from the runtime list instead of the hardcoded fallback', () => {
    const providerStatus = createCodexProviderStatus(['gpt-5.4', 'gpt-5.3-codex']);

    expect(getAvailableTeamProviderModelOptions('codex', providerStatus)).toEqual([
      { value: '', label: 'Default', badgeLabel: 'Default' },
      { value: 'gpt-5.4', label: '5.4', availabilityStatus: 'available', availabilityReason: null },
      {
        value: 'gpt-5.3-codex',
        label: '5.3 Codex',
        availabilityStatus: 'available',
        availabilityReason: null,
      },
    ]);
  });

  it('clears stale Codex selections when runtime no longer reports that model', () => {
    const providerStatus = createCodexProviderStatus(['gpt-5.4', 'gpt-5.3-codex']);

    expect(normalizeTeamModelForUi('codex', 'gpt-5.2-codex', providerStatus)).toBe('');
    expect(normalizeTeamModelForUi('codex', 'gpt-5.4', providerStatus)).toBe('gpt-5.4');
  });

  it('reports an explicit error when a Codex model is unsupported by the current runtime', () => {
    const providerStatus = createCodexProviderStatus(['gpt-5.4', 'gpt-5.3-codex']);

    expect(getTeamModelSelectionError('codex', 'gpt-5.2-codex', providerStatus)).toContain(
      'Temporarily disabled for team agents'
    );
    expect(getTeamModelSelectionError('codex', 'gpt-5.4', providerStatus)).toBeNull();
  });

  it('waits for the runtime model list before validating explicit Codex selections', () => {
    expect(getTeamModelSelectionError('codex', 'gpt-5.4')).toContain(
      'waiting for Codex runtime verification'
    );
    expect(getTeamModelSelectionError('codex', '')).toBeNull();
  });

  it('keeps runtime models selectable without per-model verification state', () => {
    const providerStatus = createCodexProviderStatus(['gpt-5.4']);
    expect(normalizeTeamModelForUi('codex', 'gpt-5.4', providerStatus)).toBe('gpt-5.4');
    expect(getAvailableTeamProviderModels('codex', providerStatus)).toEqual(['gpt-5.4']);
    expect(getTeamModelSelectionError('codex', 'gpt-5.4', providerStatus)).toBeNull();
  });

  it('does not require runtime verification for Anthropic curated models', () => {
    expect(normalizeTeamModelForUi('anthropic', 'opus')).toBe('opus');
    expect(getTeamModelSelectionError('anthropic', 'opus')).toBeNull();
  });
});
