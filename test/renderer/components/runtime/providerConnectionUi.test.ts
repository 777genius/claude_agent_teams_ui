import { describe, expect, it } from 'vitest';

import {
  formatProviderStatusText,
  getProviderConnectionModeSummary,
  getProviderCredentialSummary,
  getProviderCurrentRuntimeSummary,
  isConnectionManagedRuntimeProvider,
  shouldShowProviderConnectAction,
} from '@renderer/components/runtime/providerConnectionUi';
import { createDefaultCliExtensionCapabilities } from '@shared/utils/providerExtensionCapabilities';

import type { CliProviderStatus } from '@shared/types';

function createAnthropicProvider(
  overrides?: Partial<CliProviderStatus['connection']> & {
    authenticated?: boolean;
    authMethod?: string | null;
  }
): CliProviderStatus {
  return {
    providerId: 'anthropic',
    displayName: 'Anthropic',
    supported: true,
    authenticated: overrides?.authenticated ?? true,
    authMethod: overrides?.authMethod ?? 'oauth_token',
    verificationState: 'verified',
    statusMessage: 'Connected',
    models: ['claude-sonnet-4-6'],
    canLoginFromUi: true,
    capabilities: {
      teamLaunch: true,
      oneShot: true,
      extensions: createDefaultCliExtensionCapabilities(),
    },
    selectedBackendId: null,
    resolvedBackendId: null,
    availableBackends: [],
    externalRuntimeDiagnostics: [],
    backend: null,
    connection: {
      supportsOAuth: true,
      supportsApiKey: true,
      configurableAuthModes: ['auto', 'oauth', 'api_key'],
      configuredAuthMode: overrides?.configuredAuthMode ?? 'auto',
      apiKeyConfigured: overrides?.apiKeyConfigured ?? false,
      apiKeySource: overrides?.apiKeySource ?? null,
      apiKeySourceLabel: overrides?.apiKeySourceLabel ?? null,
    },
  };
}

function createCodexProvider(
  overrides?: Partial<CliProviderStatus['connection']> & {
    authenticated?: boolean;
    authMethod?: string | null;
    selectedBackendId?: string | null;
    resolvedBackendId?: string | null;
    availableBackends?: CliProviderStatus['availableBackends'];
    backend?: CliProviderStatus['backend'];
    statusMessage?: string | null;
    canLoginFromUi?: boolean;
  }
): CliProviderStatus {
  return {
    providerId: 'codex',
    displayName: 'Codex',
    supported: true,
    authenticated: overrides?.authenticated ?? true,
    authMethod: overrides?.authMethod ?? 'api_key',
    verificationState: 'verified',
    statusMessage: overrides?.statusMessage ?? 'Codex native ready',
    models: ['gpt-5-codex'],
    canLoginFromUi: overrides?.canLoginFromUi ?? false,
    capabilities: {
      teamLaunch: true,
      oneShot: true,
      extensions: createDefaultCliExtensionCapabilities(),
    },
    selectedBackendId: overrides?.selectedBackendId ?? 'codex-native',
    resolvedBackendId: overrides?.resolvedBackendId ?? 'codex-native',
    availableBackends:
      overrides?.availableBackends ??
      [
        {
          id: 'codex-native',
          label: 'Codex native',
          description: 'Use codex exec JSON mode.',
          selectable: true,
          recommended: true,
          available: true,
          state: 'ready',
          audience: 'general',
          statusMessage: 'Codex native ready',
        },
      ],
    externalRuntimeDiagnostics: [],
    backend:
      overrides?.backend ??
      ({
        kind: 'codex-native',
        label: 'Codex native',
      } satisfies NonNullable<CliProviderStatus['backend']>),
    connection: {
      supportsOAuth: false,
      supportsApiKey: true,
      configurableAuthModes: [],
      configuredAuthMode: overrides?.configuredAuthMode ?? null,
      apiKeyConfigured: overrides?.apiKeyConfigured ?? false,
      apiKeySource: overrides?.apiKeySource ?? null,
      apiKeySourceLabel: overrides?.apiKeySourceLabel ?? null,
    },
  };
}

describe('providerConnectionUi', () => {
  it('hides Anthropic preferred auth summary once the provider is already authenticated', () => {
    const provider = createAnthropicProvider({
      authenticated: true,
      authMethod: 'api_key',
      configuredAuthMode: 'api_key',
      apiKeyConfigured: true,
      apiKeySource: 'stored',
      apiKeySourceLabel: 'Stored in app',
    });

    expect(getProviderConnectionModeSummary(provider)).toBeNull();
  });

  it('shows Anthropic preferred auth summary when a pinned mode is selected but not connected', () => {
    const provider = createAnthropicProvider({
      authenticated: false,
      authMethod: null,
      configuredAuthMode: 'oauth',
    });

    expect(getProviderConnectionModeSummary(provider)).toBe(
      'Preferred auth: Anthropic subscription'
    );
  });

  it('treats Codex as lane-managed and hides the old connection-managed runtime summary', () => {
    const provider = createCodexProvider({
      apiKeyConfigured: true,
      apiKeySource: 'stored',
      apiKeySourceLabel: 'Stored in app',
    });

    expect(isConnectionManagedRuntimeProvider(provider)).toBe(false);
    expect(getProviderCurrentRuntimeSummary(provider)).toBeNull();
  });

  it('shows stored Codex API keys as immediately usable for native runtime', () => {
    const provider = createCodexProvider({
      apiKeyConfigured: true,
      apiKeySource: 'stored',
      apiKeySourceLabel: 'Stored in app',
    });

    expect(getProviderCredentialSummary(provider)).toBe('Saved API key available in Manage');
  });

  it('shows environment Codex credentials without claiming they are stored in Manage', () => {
    const provider = createCodexProvider({
      apiKeyConfigured: true,
      apiKeySource: 'environment',
      apiKeySourceLabel: 'Detected from CODEX_API_KEY',
    });

    expect(getProviderCredentialSummary(provider)).toBe('Detected from CODEX_API_KEY');
  });

  it('surfaces native backend status instead of flattening Codex to connected-via-api-key text', () => {
    const provider = createCodexProvider({
      availableBackends: [
        {
          id: 'codex-native',
          label: 'Codex native',
          description: 'Use codex exec JSON mode.',
          selectable: true,
          recommended: true,
          available: true,
          state: 'ready',
          audience: 'general',
          statusMessage: 'Codex native ready',
        },
      ],
    });

    expect(formatProviderStatusText(provider)).toBe('Codex native ready');
  });

  it('surfaces native auth-required state from the selected backend option', () => {
    const provider = createCodexProvider({
      authenticated: false,
      authMethod: null,
      statusMessage: 'Codex native not ready',
      resolvedBackendId: null,
      availableBackends: [
        {
          id: 'codex-native',
          label: 'Codex native',
          description: 'Use codex exec JSON mode.',
          selectable: false,
          recommended: true,
          available: false,
          state: 'authentication-required',
          audience: 'general',
          statusMessage: 'Authentication required',
          detailMessage: 'Set CODEX_API_KEY.',
        },
      ],
      backend: null,
    });

    expect(formatProviderStatusText(provider)).toBe('Authentication required');
  });

  it('never shows a Connect action for Codex after the native-only cutover', () => {
    const provider = createCodexProvider({
      authenticated: false,
      authMethod: null,
      canLoginFromUi: false,
    });

    expect(shouldShowProviderConnectAction(provider)).toBe(false);
  });
});
