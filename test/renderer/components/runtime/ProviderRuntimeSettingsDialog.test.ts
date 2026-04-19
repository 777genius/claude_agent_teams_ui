import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliProviderStatus } from '@shared/types';

interface StoreState {
  appConfig: {
    providerConnections: {
      anthropic: {
        authMode: 'auto' | 'oauth' | 'api_key';
      };
      codex: Record<string, never>;
    };
  };
  apiKeys: {
    id: string;
    envVarName: string;
    scope: 'user' | 'project';
    name: string;
    maskedValue?: string;
    createdAt?: number;
  }[];
  apiKeysLoading: boolean;
  apiKeysError: string | null;
  apiKeySaving: boolean;
  apiKeyStorageStatus: { available: boolean; backend: string; detail?: string | null } | null;
  fetchApiKeys: ReturnType<typeof vi.fn>;
  fetchApiKeyStorageStatus: ReturnType<typeof vi.fn>;
  saveApiKey: ReturnType<typeof vi.fn>;
  deleteApiKey: ReturnType<typeof vi.fn>;
  updateConfig: ReturnType<typeof vi.fn>;
}

const storeState = {} as StoreState;

vi.mock('@renderer/store', () => {
  const useStore = (selector: (state: StoreState) => unknown) => selector(storeState);
  Object.assign(useStore, {
    setState: vi.fn(),
  });
  return { useStore };
});

vi.mock('@renderer/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
  }: React.PropsWithChildren<{
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>) =>
    React.createElement(
      'button',
      {
        type,
        disabled,
        onClick,
      },
      children
    ),
}));

vi.mock('@renderer/components/ui/dialog', () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? React.createElement('div', { 'data-testid': 'dialog' }, children) : null,
  DialogContent: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', { 'data-testid': 'dialog-content' }, children),
  DialogHeader: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  DialogTitle: ({ children }: React.PropsWithChildren) => React.createElement('h2', null, children),
  DialogDescription: ({ children }: React.PropsWithChildren) =>
    React.createElement('p', null, children),
}));

vi.mock('@renderer/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement('input', props),
}));

vi.mock('@renderer/components/ui/label', () => ({
  Label: ({ children }: React.PropsWithChildren) => React.createElement('label', null, children),
}));

vi.mock('@renderer/components/ui/select', () => ({
  Select: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  SelectTrigger: ({ children }: React.PropsWithChildren) =>
    React.createElement('button', { type: 'button' }, children),
  SelectValue: () => React.createElement('span', null, 'select-value'),
  SelectContent: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  SelectItem: ({ children }: React.PropsWithChildren<{ value: string }>) =>
    React.createElement('button', { type: 'button' }, children),
}));

vi.mock('@renderer/components/ui/tabs', () => ({
  Tabs: ({
    children,
    value,
    onValueChange,
  }: React.PropsWithChildren<{ value: string; onValueChange: (value: string) => void }>) =>
    React.createElement('div', { 'data-value': value, 'data-on-change': Boolean(onValueChange) }, children),
  TabsList: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TabsTrigger: ({
    children,
    value,
    onClick,
  }: React.PropsWithChildren<{ value: string; onClick?: () => void }>) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-value': value,
        onClick,
      },
      children
    ),
}));

vi.mock('@renderer/components/runtime/ProviderRuntimeBackendSelector', () => ({
  ProviderRuntimeBackendSelector: ({
    provider,
    onSelect,
  }: {
    provider: { providerId: string };
    onSelect: (providerId: string, backendId: string) => void;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onSelect(provider.providerId, 'api'),
      },
      'Select runtime backend'
    ),
  getProviderRuntimeBackendSummary: () => null,
  getVisibleProviderRuntimeBackendOptions: (provider: CliProviderStatus) =>
    provider.availableBackends ?? [],
}));

vi.mock('@renderer/components/common/ProviderBrandLogo', () => ({
  ProviderBrandLogo: ({ providerId }: { providerId: string }) =>
    React.createElement('span', {
      'data-testid': `provider-logo-${providerId}`,
      'data-provider-id': providerId,
    }),
}));

import { ProviderRuntimeSettingsDialog } from '@renderer/components/runtime/ProviderRuntimeSettingsDialog';
import { createDefaultCliExtensionCapabilities } from '@shared/utils/providerExtensionCapabilities';

function createCodexProvider(
  overrides?: Partial<CliProviderStatus['connection']> & {
    authenticated?: boolean;
    authMethod?: string | null;
    selectedBackendId?: string | null;
    resolvedBackendId?: string | null;
    availableBackends?: CliProviderStatus['availableBackends'];
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
    statusMessage: 'Codex native ready',
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
          description: 'Use the local codex exec JSON seam.',
          selectable: true,
          recommended: true,
          available: true,
          state: 'ready',
          audience: 'general',
          statusMessage: 'Codex native ready',
        },
      ],
    externalRuntimeDiagnostics: [],
    backend: {
      kind: 'codex-native',
      label: 'Codex native',
    },
    connection: {
      supportsOAuth: false,
      supportsApiKey: true,
      configurableAuthModes: [],
      configuredAuthMode: null,
      apiKeyConfigured: overrides?.apiKeyConfigured ?? false,
      apiKeySource: overrides?.apiKeySource ?? null,
      apiKeySourceLabel: overrides?.apiKeySourceLabel ?? null,
    },
  };
}

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

function createGeminiProvider(): CliProviderStatus {
  return {
    providerId: 'gemini',
    displayName: 'Gemini',
    supported: true,
    authenticated: true,
    authMethod: 'api_key',
    verificationState: 'verified',
    statusMessage: 'Connected',
    models: ['gemini-2.5-pro'],
    canLoginFromUi: false,
    capabilities: {
      teamLaunch: true,
      oneShot: true,
      extensions: createDefaultCliExtensionCapabilities(),
    },
    selectedBackendId: 'auto',
    resolvedBackendId: 'api',
    availableBackends: [
      {
        id: 'auto',
        label: 'Auto',
        description: 'Automatically choose the best backend.',
        selectable: true,
        recommended: true,
        available: true,
      },
      {
        id: 'api',
        label: 'Gemini API',
        description: 'Use GEMINI_API_KEY and Google AI Studio billing.',
        selectable: true,
        recommended: false,
        available: true,
      },
    ],
    externalRuntimeDiagnostics: [],
    backend: {
      kind: 'api',
      label: 'Gemini API',
    },
    connection: {
      supportsOAuth: false,
      supportsApiKey: true,
      configurableAuthModes: [],
      configuredAuthMode: null,
      apiKeyConfigured: true,
      apiKeySource: 'stored',
      apiKeySourceLabel: 'Stored in app',
    },
  };
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button with text "${text}" not found`);
  }
  return button;
}

describe('ProviderRuntimeSettingsDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.appConfig = {
      providerConnections: {
        anthropic: {
          authMode: 'auto',
        },
        codex: {},
      },
    };
    storeState.apiKeys = [];
    storeState.apiKeysLoading = false;
    storeState.apiKeysError = null;
    storeState.apiKeySaving = false;
    storeState.apiKeyStorageStatus = { available: true, backend: 'keytar', detail: null };
    storeState.fetchApiKeys = vi.fn(() => Promise.resolve(undefined));
    storeState.fetchApiKeyStorageStatus = vi.fn(() => Promise.resolve(undefined));
    storeState.saveApiKey = vi.fn(() => Promise.resolve(undefined));
    storeState.deleteApiKey = vi.fn(() => Promise.resolve(undefined));
    storeState.updateConfig = vi.fn((section: string, data: Record<string, unknown>) => {
      if (section === 'providerConnections') {
        const nextProviderConnections = data as Partial<StoreState['appConfig']['providerConnections']>;
        storeState.appConfig = {
          ...storeState.appConfig,
          providerConnections: {
            anthropic: {
              ...storeState.appConfig.providerConnections.anthropic,
              ...(nextProviderConnections.anthropic ?? {}),
            },
            codex: {},
          },
        };
      }

      return Promise.resolve(undefined);
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('renders provider logos inside the provider tabs', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(ProviderRuntimeSettingsDialog, {
          open: true,
          onOpenChange: vi.fn(),
          providers: [createAnthropicProvider(), createCodexProvider()],
          initialProviderId: 'anthropic',
          onSelectBackend: vi.fn(),
          onRefreshProvider: vi.fn(() => Promise.resolve(undefined)),
        })
      );
      await Promise.resolve();
    });

    expect(host.querySelector('[data-testid="provider-logo-anthropic"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="provider-logo-codex"]')).not.toBeNull();
  });

  it('renders anthropic connection cards and can switch to API key mode', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onRefreshProvider = vi.fn(() => Promise.resolve(undefined));

    await act(async () => {
      root.render(
        React.createElement(ProviderRuntimeSettingsDialog, {
          open: true,
          onOpenChange: vi.fn(),
          providers: [
            createAnthropicProvider({
              configuredAuthMode: 'auto',
              apiKeyConfigured: true,
              apiKeySource: 'stored',
              apiKeySourceLabel: 'Stored in app',
            }),
          ],
          initialProviderId: 'anthropic',
          onSelectBackend: vi.fn(),
          onRefreshProvider,
        })
      );
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Connection method');
    expect(host.textContent).toContain('Anthropic subscription');
    expect(host.textContent).toContain('API key');

    await act(async () => {
      findButtonByText(host, 'API key').click();
      await Promise.resolve();
    });

    expect(storeState.updateConfig).toHaveBeenCalledWith('providerConnections', {
      anthropic: {
        authMode: 'api_key',
      },
    });
    expect(onRefreshProvider).toHaveBeenCalledWith('anthropic');
  });

  it('shows native-only Codex connection copy and API-key management without login actions', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(ProviderRuntimeSettingsDialog, {
          open: true,
          onOpenChange: vi.fn(),
          providers: [
            createCodexProvider({
              authenticated: false,
              authMethod: null,
              apiKeyConfigured: true,
              apiKeySource: 'stored',
              apiKeySourceLabel: 'Stored in app',
            }),
          ],
          initialProviderId: 'codex',
          onSelectBackend: vi.fn(),
          onRefreshProvider: vi.fn(() => Promise.resolve(undefined)),
          onRequestLogin: vi.fn(),
        })
      );
      await Promise.resolve();
    });

    expect(host.textContent).toContain(
      'Codex launches always use the native runtime now. Manage API-key credentials here before launching teams or one-shot Codex runs.'
    );
    expect(host.textContent).toContain('Set API key');
    expect(host.textContent).not.toContain('Connection method');
    expect(host.textContent).not.toContain('Connect Codex');
    expect(host.textContent).not.toContain('Reconnect Codex');
  });

  it('keeps the API key icon container square', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(ProviderRuntimeSettingsDialog, {
          open: true,
          onOpenChange: vi.fn(),
          providers: [createAnthropicProvider()],
          initialProviderId: 'anthropic',
          onSelectBackend: vi.fn(),
          onRefreshProvider: vi.fn(() => Promise.resolve(undefined)),
        })
      );
      await Promise.resolve();
    });

    const icon = host.querySelector('[data-testid="provider-api-key-icon"]');
    expect(icon).not.toBeNull();
    expect(icon?.className).toContain('size-8');
    expect(icon?.className).not.toContain('w-8');
    expect(icon?.className).toContain('shrink-0');
  });

  it('keeps the API key form open and shows an error when delete fails', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onRefreshProvider = vi.fn(() => Promise.resolve(undefined));
    storeState.apiKeys = [
      {
        id: 'key-1',
        envVarName: 'OPENAI_API_KEY',
        scope: 'user',
        name: 'Codex API Key',
        maskedValue: 'sk-proj-...1234',
        createdAt: Date.now(),
      },
    ];
    storeState.deleteApiKey = vi.fn(() => Promise.reject(new Error('Delete failed')));

    await act(async () => {
      root.render(
        React.createElement(ProviderRuntimeSettingsDialog, {
          open: true,
          onOpenChange: vi.fn(),
          providers: [
            createCodexProvider({
              apiKeyConfigured: true,
              apiKeySource: 'stored',
              apiKeySourceLabel: 'Stored in app',
            }),
          ],
          initialProviderId: 'codex',
          onSelectBackend: vi.fn(),
          onRefreshProvider,
        })
      );
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(host, 'Replace key').click();
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(host, 'Delete').click();
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Delete failed');
    expect(host.textContent).toContain('Update key');
    expect(onRefreshProvider).not.toHaveBeenCalled();
  });

  it('shows a runtime error when backend selection refresh fails after a successful update', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSelectBackend = vi.fn(() =>
      Promise.reject(new Error('Runtime updated, but failed to refresh provider status.'))
    );

    await act(async () => {
      root.render(
        React.createElement(ProviderRuntimeSettingsDialog, {
          open: true,
          onOpenChange: vi.fn(),
          providers: [createGeminiProvider()],
          initialProviderId: 'gemini',
          onSelectBackend,
        })
      );
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(host, 'Select runtime backend').click();
      await Promise.resolve();
    });

    expect(onSelectBackend).toHaveBeenCalledWith('gemini', 'api');
    expect(host.textContent).toContain('Runtime updated, but failed to refresh provider status.');
  });
});
